// One-time seed: inserts sample salon services so the UI has real data.
// Run with: node scripts/seed-services.js
import 'dotenv/config';
import { connectToMongoDB } from '../lib/db.js';

const IMG = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;

const services = [
  {
    serviceName: 'Signature Haircut & Styling',
    category: 'Haircut & Styling',
    description:
      'A personalised cut and blow-dry finish by our senior stylists, tailored to your face shape and hair type.',
    price: 25,
    duration: 45,
    image: IMG('1580618672591-eb180b1a973f'),
  },
  {
    serviceName: 'Classic Men’s Cut',
    category: 'Haircut & Styling',
    description:
      'Precision clipper and scissor cut with a clean neck shave, finished with a relaxing head massage.',
    price: 18,
    duration: 30,
    image: IMG('1599351431202-1e0f0137899a'),
  },
  {
    serviceName: 'Balayage Hair Coloring',
    category: 'Hair Coloring',
    description:
      'Hand-painted highlights for a natural, sun-kissed gradient. Includes toner and a nourishing mask.',
    price: 95,
    duration: 150,
    image: IMG('1470259078422-826894b933aa'),
  },
  {
    serviceName: 'Keratin Smoothing Treatment',
    category: 'Hair Treatment',
    description:
      'Frizz-free, glossy hair for up to 12 weeks. A deep-repair treatment that restores shine and softness.',
    price: 75,
    duration: 90,
    image: IMG('1519699047748-de8e457a634e'),
  },
  {
    serviceName: 'Glow Facial & Skincare',
    category: 'Facial & Skincare',
    description:
      'A deep-cleansing facial with gentle exfoliation and a hydrating mask for instantly brighter skin.',
    price: 45,
    duration: 60,
    image: IMG('1570172619644-dfd03ed5d881'),
  },
  {
    serviceName: 'Bridal Makeup Package',
    category: 'Makeup',
    description:
      'Complete bridal look with airbrush foundation, false lashes and a long-wear finish for your big day.',
    price: 120,
    duration: 120,
    image: IMG('1487412947147-5cebf100ffc2'),  },
  {
    serviceName: 'Evening Party Makeup',
    category: 'Makeup',
    description:
      'A glamorous, camera-ready look with bold eyes or lips, applied by our professional makeup artists.',
    price: 60,
    duration: 60,
    image: IMG('1512496015851-a90fb38ba796'),
  },
  {
    serviceName: 'Gel Manicure & Pedicure',
    category: 'Manicure & Pedicure',
    description:
      'Long-lasting gel polish for hands and feet, including cuticle care and a soothing hand massage.',
    price: 35,
    duration: 50,
    image: IMG('1519014816548-bf5fe059798b'),
  },
  {
    serviceName: 'Relaxing Aroma Spa Massage',
    category: 'Spa & Massage',
    description:
      'A full-body aromatherapy massage with warm oils to release tension and calm your mind.',
    price: 55,
    duration: 60,
    image: IMG('1544161515-4ab6ce6db874'),
  },
];

async function seed() {
  const db = await connectToMongoDB();
  const collection = db.collection('services');

  const existing = await collection.countDocuments();
  if (existing > 0) {
    console.log(`Seed skipped: services collection already has ${existing} documents.`);
    return;
  }

  const now = Date.now();
  const documents = services.map((service, index) => ({
    ...service,
    status: 'active',
    // Slight time gaps so "newest first" ordering is stable.
    createdAt: new Date(now - index * 60_000),
  }));

  const result = await collection.insertMany(documents);
  console.log(`Seeded ${result.insertedCount} services.`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
