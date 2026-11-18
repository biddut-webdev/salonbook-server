import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { TIME_SLOTS } from '../lib/constants.js';
import { verifyJWT, requireRole } from '../middleware/auth.js';

const router = Router();

// Parse "YYYY-MM-DD" into a UTC date. Returns null for bad/ambiguous input.
function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * POST /api/appointments
 * Customer creates an appointment request for an active service.
 */
router.post('/', verifyJWT, requireRole('customer'), async (req, res, next) => {
  try {
    const { serviceId, appointmentDate, timeSlot, message = '' } = req.body ?? {};

    if (!ObjectId.isValid(serviceId)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid service id.' });
    }

    const date = parseDateOnly(appointmentDate);
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid appointment date.' });
    }

    if (!TIME_SLOTS.includes(timeSlot)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid time slot.' });
    }

    const services = getDb().collection('services');
    const service = await services.findOne({
      _id: new ObjectId(serviceId),
      status: 'active',
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'This service is not available for booking.',
      });
    }

    const appointments = getDb().collection('appointments');
    const customerId = new ObjectId(req.user.id);

    // No duplicate active booking for the same customer, date and slot.
    const duplicate = await appointments.findOne({
      customerId,
      appointmentDate: date,
      timeSlot,
      status: { $in: ['pending', 'confirmed'] },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active appointment at this time.',
      });
    }

    const appointment = {
      serviceId: service._id,
      customerId,
      appointmentDate: date,
      timeSlot,
      message: String(message).trim(),
      servicePrice: service.price,
      paymentStatus: 'unpaid',
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await appointments.insertOne(appointment);

    res.status(201).json({
      success: true,
      data: { ...appointment, _id: result.insertedId },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/mine
 * The logged-in customer's own appointments (newest first), with service info.
 */
router.get('/mine', verifyJWT, requireRole('customer'), async (req, res, next) => {
  try {
    const appointments = await getDb()
      .collection('appointments')
      .aggregate([
        { $match: { customerId: new ObjectId(req.user.id) } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: 'services',
            localField: 'serviceId',
            foreignField: '_id',
            as: 'service',
          },
        },
        { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            appointmentDate: 1,
            timeSlot: 1,
            message: 1,
            servicePrice: 1,
            paymentStatus: 1,
            status: 1,
            createdAt: 1,
            service: {
              serviceName: 1,
              image: 1,
              category: 1,
              duration: 1,
            },
          },
        },
      ])
      .toArray();

    res.json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
});

export default router;
