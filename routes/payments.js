
import { Router } from 'express';
import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { verifyJWT, requireRole } from '../middleware/auth.js';

const router = Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured.');
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Customer: Create a Checkout Session for a confirmed appointment
router.post(
  '/create-checkout-session',
  verifyJWT,
  requireRole('customer'),
  async (req, res, next) => {
    try {
      const { appointmentId } = req.body ?? {};

      if (!ObjectId.isValid(appointmentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid appointment ID.',
        });
      }

      const db = getDb();
      const customerId = new ObjectId(req.user.id);

      const appointment = await db.collection('appointments').findOne({
        _id: new ObjectId(appointmentId),
        customerId,
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found.',
        });
      }

      if (appointment.status !== 'confirmed') {
        return res.status(409).json({
          success: false,
          message: 'Only confirmed appointments can be paid.',
        });
      }

      if (appointment.paymentStatus === 'paid') {
        return res.status(409).json({
          success: false,
          message: 'This appointment has already been paid.',
        });
      }

      const amount = Number(appointment.servicePrice);
      const currency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
      const amountInCents = Math.round(amount * 100);

      if (!Number.isFinite(amount) || amount <= 0 || amountInCents < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid appointment payment amount.',
        });
      }

      const customer = await db.collection('user').findOne(
        { _id: customerId },
        { projection: { name: 1, email: 1 } }
      );

      const service = await db.collection('services').findOne({
        _id: appointment.serviceId,
      });

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

      const stripe = getStripe();

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',

        line_items: [
          {
            price_data: {
              currency,
              unit_amount: amountInCents,
              product_data: {
                name: service?.serviceName || 'Salon Appointment',
                description: `Appointment date: ${appointment.appointmentDate.toISOString().slice(0, 10)
                  } | ${appointment.timeSlot}`,
              },
            },
            quantity: 1,
          },
        ],
        ...(customer?.email ? { customer_email: customer.email } : {}),
        client_reference_id: appointment._id.toString(),
        metadata: {
          appointmentId: appointment._id.toString(),
          customerId: customerId.toString(),
        },
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment/cancel?appointment_id=${appointment._id}`,
      });

      res.status(200).json({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

// Stripe webhook handler.
// This handler must receive the raw request body, not parsed JSON.

export async function stripeWebhookHandler(req, res) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Stripe webhook secret is not configured.');
    return res.status(500).send('Webhook is not configured.');
  }

  let event;

  try {
    const signature = req.headers['stripe-signature'];

    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    const supportedEvents = [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
    ];

    if (!supportedEvents.includes(event.type)) {
      return res.json({ received: true });
    }

    const session = event.data.object;

    const isPaid =
      (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) &&
      session.payment_status === 'paid';

    const isFailed =
      event.type === 'checkout.session.async_payment_failed' ||
      event.type === 'checkout.session.expired';

    if (!isPaid && !isFailed) {
      return res.json({ received: true });
    }

    const appointmentId = session.metadata?.appointmentId;
    const customerId = session.metadata?.customerId;

    if (
      !ObjectId.isValid(appointmentId) ||
      !ObjectId.isValid(customerId)
    ) {
      console.error('Invalid appointment/customer metadata.');
      return res.status(400).send('Invalid session metadata.');
    }

    const db = getDb();

    const appointments = db.collection('appointments');
    const transactions = db.collection('transactions');

    const appointment = await appointments.findOne({
      _id: new ObjectId(appointmentId),
      customerId: new ObjectId(customerId),
    });

    if (!appointment) {
      console.error('Appointment not found:', session.id);
      return res.status(400).send('Appointment not found.');
    }

    const amount = Number(
      ((session.amount_total || 0) / 100).toFixed(2)
    );

    const transactionFields = {
      appointmentId: appointment._id,
      customerId: appointment.customerId,
      amount,
      currency: (session.currency || '').toLowerCase(),
      stripeSessionId: session.id,
      createdAt: new Date(),
    };

    // Create transaction only once.
    await transactions.updateOne(
      { stripeSessionId: session.id },
      {
        $setOnInsert: {
          ...transactionFields,
          status: isPaid ? 'paid' : 'failed',
        },
      },
      { upsert: true }
    );

    if (isPaid) {
      // Update transaction status to paid.
      await transactions.updateOne(
        { stripeSessionId: session.id },
        { $set: { status: 'paid' } }
      );

      // IMPORTANT: Update appointment payment status.
      await appointments.updateOne(
        {
          _id: appointment._id,
          customerId: appointment.customerId,
        },
        {
          $set: {
            paymentStatus: 'paid',
            paidAt: new Date(),
          },
        }
      );
    }

    console.log(
      `Stripe event processed: ${event.type} (${session.id})`
    );

    return res.json({ received: true });

  } catch (error) {
    console.error('Stripe webhook processing failed:', error);
    return res.status(500).json({ received: false });
  }
}

