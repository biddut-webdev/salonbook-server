
import { Router } from 'express';
import { getDb } from '../lib/db.js';
import { verifyJWT, requireRole } from '../middleware/auth.js';

const router = Router();

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Admin: View all transactions (read-only)
router.get('/', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { search = '', status = '' } = req.query;

    const allowedStatuses = ['paid', 'failed'];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status filter.',
      });
    }

    const pipeline = [
      { $sort: { createdAt: -1 } },

      {
        $lookup: {
          from: 'appointments',
          localField: 'appointmentId',
          foreignField: '_id',
          as: 'appointment',
        },
      },
      {
        $unwind: {
          path: '$appointment',
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: 'user',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      {
        $unwind: {
          path: '$customer',
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: 'services',
          localField: 'appointment.serviceId',
          foreignField: '_id',
          as: 'service',
        },
      },
      {
        $unwind: {
          path: '$service',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    const match = {};

    if (status) {
      match.status = status;
    }

    if (search.trim()) {
      const regex = {
        $regex: escapeRegex(search.trim()),
        $options: 'i',
      };

      match.$or = [
        { 'customer.name': regex },
        { 'customer.email': regex },
        { 'service.serviceName': regex },
        { stripeSessionId: regex },
      ];
    }

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push({
      $project: {
        appointmentId: 1,
        customerId: 1,
        amount: 1,
        currency: 1,
        stripeSessionId: 1,
        status: 1,
        createdAt: 1,

        customer: {
          name: '$customer.name',
          email: '$customer.email',
          image: '$customer.image',
        },

        service: {
          serviceName: '$service.serviceName',
          image: '$service.image',
        },

        appointment: {
          appointmentDate: '$appointment.appointmentDate',
          timeSlot: '$appointment.timeSlot',
        },
      },
    });

    const transactions = await getDb()
      .collection('transactions')
      .aggregate(pipeline)
      .toArray();

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
