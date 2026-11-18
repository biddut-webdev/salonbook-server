import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { CATEGORIES } from '../lib/constants.js';

const router = Router();

// Escapes special regex characters so a search string like "a+b" is treated
// as text, not as a regular expression.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/services
 * Public list of ACTIVE services.
 * Query: ?search=hair&category=Makeup&sort=asc|desc&limit=6
 */
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

/**
 * GET /api/services/categories
 * All service categories with how many active services each has.
 */
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

/**
 * GET /api/services/:id
 * Public details of ONE active service.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // A malformed id must not reach MongoDB (it would throw).
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
