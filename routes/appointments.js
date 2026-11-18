import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { TIME_SLOTS } from '../lib/constants.js';
import { verifyJWT, requireRole } from '../middleware/auth.js';

const router = Router();

const STATUSES = ['pending', 'confirmed', 'cancelled'];
const CLOSED_STATUSES = ['cancelled'];

const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  cancelled: [],
};

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appointmentPipeline(extraStages = []) {
  return [
    { $sort: { appointmentDate: -1, timeSlot: 1 } },
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
      $lookup: {
        from: 'user',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    ...extraStages,
    {
      $project: {
        serviceId: 1,
        customerId: 1,
        appointmentDate: 1,
        timeSlot: 1,
        message: 1,
        servicePrice: 1,
        paymentStatus: 1,
        status: 1,
        createdAt: 1,
        service: { serviceName: 1, image: 1, category: 1, duration: 1 },
        customer: { name: 1, email: 1, image: 1 },
      },
    },
  ];
}

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

router.get(
  '/mine',
  verifyJWT,
  requireRole('customer'),
  async (req, res, next) => {
    try {
      const appointments = await getDb()
        .collection('appointments')
        .aggregate([
          { $match: { customerId: new ObjectId(req.user.id) } },
          ...appointmentPipeline(),
        ])
        .toArray();

      res.json({ success: true, data: appointments });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/cancel',
  verifyJWT,
  requireRole('customer'),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid appointment id.' });
      }

      const appointments = getDb().collection('appointments');
      const appointment = await appointments.findOne({
        _id: new ObjectId(id),
        customerId: new ObjectId(req.user.id),
      });

      if (!appointment) {
        return res
          .status(404)
          .json({ success: false, message: 'Appointment not found.' });
      }

      if (appointment.status !== 'pending') {
        return res.status(409).json({
          success: false,
          message: 'Only pending appointments can be cancelled.',
        });
      }

      await appointments.updateOne(
        {
          _id: appointment._id,
          status: 'pending',
        },
        {
          $set: {
            status: 'cancelled',
            updatedAt: new Date(),
          },
        }
      );

      res.json({
        success: true,
        data: { ...appointment, status: 'cancelled' },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { status = '', search = '', date = '' } = req.query;

    if (status && !STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid status filter.' });
    }

    const match = {};
    if (status) match.status = status;

    if (date) {
      const day = parseDateOnly(date);
      if (!day) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid date filter.' });
      }
      match.appointmentDate = day;
    }

    const extraStages = [];
    if (search.trim()) {
      const regex = { $regex: escapeRegex(search.trim()), $options: 'i' };
      extraStages.push({
        $match: {
          $or: [
            { 'customer.name': regex },
            { 'customer.email': regex },
            { 'service.serviceName': regex },
          ],
        },
      });
    }

    const appointments = await getDb()
      .collection('appointments')
      .aggregate([{ $match: match }, ...appointmentPipeline(extraStages)])
      .toArray();

    res.json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const db = getDb();

    const grouped = await db
      .collection('appointments')
      .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray();

    const statusCounts = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    for (const row of grouped) {
      if (row._id in statusCounts) statusCounts[row._id] = row.count;
    }

    const revenueRows = await db
      .collection('transactions')
      .aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .toArray();

    const [totalCustomers, totalServices, recentAppointments] = await Promise.all([
      db.collection('user').countDocuments({ role: 'customer' }),
      db.collection('services').countDocuments({ status: 'active' }),
      db
        .collection('appointments')
        .aggregate([...appointmentPipeline(), { $limit: 5 }])
        .toArray(),
    ]);

    const totalAppointments = Object.values(statusCounts).reduce(
      (sum, count) => sum + count,
      0
    );

    res.json({
      success: true,
      data: {
        totalAppointments,
        statusCounts,
        revenue: revenueRows[0]?.total || 0,
        totalCustomers,
        totalServices,
        recentAppointments,
      },
    });
  } catch (error) {
    next(error);
  }
});


router.patch('/:id/status', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment id.',
      });
    }

    if (!STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment status.',
      });
    }

    const appointments = getDb().collection('appointments');

    const appointment = await appointments.findOne({
      _id: new ObjectId(id),
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found.',
      });
    }

    const allowedStatuses = ALLOWED_TRANSITIONS[appointment.status] || [];

    if (!allowedStatuses.includes(status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot change appointment from ${appointment.status} to ${status}.`,
      });
    }

    await appointments.updateOne(
      {
        _id: appointment._id,
        status: appointment.status,
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    res.json({
      success: true,
      data: { ...appointment, status },
    });
  } catch (error) {
    next(error);
  }
});



export default router;
