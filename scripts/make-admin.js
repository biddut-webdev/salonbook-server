import 'dotenv/config';
import { connectToMongoDB, getDb } from '../lib/db.js';

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/make-admin.js user@example.com');
  process.exit(1);
}

await connectToMongoDB();

const result = await getDb()
  .collection('user')
  .updateOne({ email }, { $set: { role: 'admin' } });

console.log(
  result.matchedCount ? `${email} is now an admin.` : `No user found: ${email}`
);

process.exit(0);