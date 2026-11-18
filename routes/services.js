import { Router } from 'express';
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { CATEGORIES } from '../lib/constants.js';
import { verifyJWT, requireRole } from '../middleware/auth.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  },
});

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateService(body, { partial = false } = {}) {
  const data = {};
  const has = (key) => body[key] !== undefined;

  if (!partial || has('serviceName')) {
    const name = typeof body.serviceName === 'string' ? body.serviceName.trim() : '';
    if (!name || name.length > 100) {
      return { error: 'Service name must be between 1 and 100 characters.' };
    }
    data.serviceName = name;
  }

  if (!partial || has('category')) {
    if (!CATEGORIES.includes(body.category)) {
      return { error: 'Please select a valid category.' };
    }
    data.category = body.category;
  }

  if (!partial || has('description')) {
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';
    if (!description || description.length > 2000) {
      return { error: 'Description must be between 1 and 2000 characters.' };
    }
    data.description = description;
  }

  if (!partial || has('price')) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { error: 'Price must be a positive number.' };
    }
    data.price = price;
  }

  if (!partial || has('duration')) {
    const duration = Number(body.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      return { error: 'Duration must be a positive number (in minutes).' };
    }
    data.duration = duration;
  }

  if (!partial || has('image')) {
    const image = typeof body.image === 'string' ? body.image.trim() : '';
    if (!/^https:\/\/.+/i.test(image) || image.length > 2000) {
      return { error: 'Please upload a valid service image.' };
    }
    data.image = image;
  }

  if (has('status')) {
    if (!['active', 'inactive'].includes(body.status)) {
      return { error: 'Status must be active or inactive.' };
    }
    data.status = body.status;
  } else if (!partial) {
    data.status = 'active';
  }

  return { data };
}

router.get('/', async (req, res, next) => {
  try {
    const { search = '', category = '', sort = '', limit } = req.query;

    const filter = { status: 'active' };
    if (search.trim()) {
      filter.serviceName = { $regex: escapeRegex(search.trim()), $options: 'i' };
    }
    if (category) {
      filter.category = category;
    }

    let cursor = getDb().collection('services').find(filter);
    cursor = sort === 'asc' || sort === 'desc'
      ? cursor.sort({ price: sort === 'asc' ? 1 : -1 })
      : cursor.sort({ createdAt: -1 });

    if (limit) {
      cursor = cursor.limit(Math.min(Number(limit) || 6, 100));
    }

    const services = await cursor.toArray();
    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

router.get('/categories', async (req, res, next) => {
  try {
    const counts = await getDb()
      .collection('services')
      .aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ])
      .toArray();

    const countByCategory = Object.fromEntries(
      counts.map((item) => [item._id, item.count]),
    );

    const categories = CATEGORIES.map((name) => ({
      name,
      count: countByCategory[name] || 0,
    }));

    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/all', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { search = '' } = req.query;

    const filter = {};
    if (search.trim()) {
      filter.serviceName = { $regex: escapeRegex(search.trim()), $options: 'i' };
    }

    const services = await getDb()
      .collection('services')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/:id', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid service id.' });
    }

    const service = await getDb()
      .collection('services')
      .findOne({ _id: new ObjectId(id) });

    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: 'Service not found.' });
    }

    res.json({ success: true, data: service });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/upload-image',
  verifyJWT,
  requireRole('admin'),
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: 'Please select an image.' });
      }

      const apiKey = process.env.IMGBB_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          message: 'ImgBB API key is not configured.',
        });
      }

      const formData = new FormData();
      formData.append('image', req.file.buffer.toString('base64'));

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        return res.status(502).json({
          success: false,
          message: 'Image upload failed. Please try again.',
        });
      }

      res.json({ success: true, imageUrl: result.data.url });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { error, data } = validateService(req.body ?? {});

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const service = { ...data, createdAt: new Date() };
    const result = await getDb().collection('services').insertOne(service);

    res.status(201).json({
      success: true,
      message: 'Service created successfully.',
      data: { _id: result.insertedId, ...service },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid service id.' });
    }

    const { error, data } = validateService(req.body ?? {}, { partial: true });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'No valid fields to update.' });
    }

    const updated = await getDb()
      .collection('services')
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...data, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: 'Service not found.' });
    }

    res.json({
      success: true,
      message: 'Service updated successfully.',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', verifyJWT, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid service id.' });
    }

    const serviceId = new ObjectId(id);

    const inUse = await getDb()
      .collection('appointments')
      .findOne({ serviceId: { $in: [serviceId, id] } });

    if (inUse) {
      return res.status(409).json({
        success: false,
        message: 'This service has appointments. Deactivate it instead of deleting.',
      });
    }

    const result = await getDb()
      .collection('services')
      .deleteOne({ _id: serviceId });

    if (!result.deletedCount) {
      return res
        .status(404)
        .json({ success: false, message: 'Service not found.' });
    }

    res.json({ success: true, message: 'Service deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid service id.' });
    }

    const service = await getDb()
      .collection('services')
      .findOne({ _id: new ObjectId(id), status: 'active' });

    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: 'Service not found or inactive.' });
    }

    res.json({ success: true, data: service });
  } catch (error) {
    next(error);
  }
});

export default router;