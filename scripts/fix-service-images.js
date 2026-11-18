// Updates service images to match their actual service (one-time fix).
// Run with: node scripts/fix-service-images.js
import 'dotenv/config';
import { connectToMongoDB } from '../lib/db.js';

const IMG = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;

const imagesByService = {
  'Signature Haircut & Styling': IMG('1580618672591-eb180b1a973f'),
  'Classic Men’s Cut': IMG('1599351431202-1e0f0137899a'),
  'Balayage Hair Coloring': IMG('1470259078422-826894b933aa'),
  'Keratin Smoothing Treatment': IMG('1519699047748-de8e457a634e'),
  'Glow Facial & Skincare': IMG('1570172619644-dfd03ed5d881'),
  'Bridal Makeup Package': IMG('1487412947147-5cebf100ffc2'),
  'Evening Party Makeup': IMG('1512496015851-a90fb38ba796'),
  'Gel Manicure & Pedicure': IMG('1519014816548-bf5fe059798b'),
  'Relaxing Aroma Spa Massage': IMG('1544161515-4ab6ce6db874'),
};

async function fixImages() {
  const db = await connectToMongoDB();
  const collection = db.collection('services');

  for (const [serviceName, image] of Object.entries(imagesByService)) {
    await collection.updateOne({ serviceName }, { $set: { image } });
  }
  console.log('Service images updated.');
}

fixImages()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
