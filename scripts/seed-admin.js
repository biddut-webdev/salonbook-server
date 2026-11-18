// Creates (or promotes) the salon admin account.
//
// It uses Better Auth's own sign-up endpoint so the password is hashed
// exactly the same way as a normal account, then flips `role` to "admin"
// with a direct MongoDB update (role is `input: false`, so the API cannot
// set it from the client).
//
// Usage: npm run seed:admin

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const BASE_URL = process.env.BETTER_AUTH_URL || 'http://localhost:5000';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Salon Admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@salonbook.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123';

async function main() {
  const response = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    // Better Auth rejects requests without a trusted Origin header.
    headers: {
      'Content-Type': 'application/json',
      Origin: process.env.CLIENT_URL || 'http://localhost:3000',
    },
    body: JSON.stringify({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  // 200 = created, 422 = account already exists (that is fine for re-runs).
  if (!response.ok && response.status !== 422) {
    const body = await response.text();
    throw new Error(`Sign-up failed (${response.status}): ${body}`);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const users = client.db(process.env.MONGODB_DB || 'salonbook').collection('user');

  const result = await users.updateOne(
    { email: ADMIN_EMAIL },
    { $set: { role: 'admin', isBlocked: false } }
  );

  console.log(
    result.matchedCount
      ? `✅ Admin ready: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`
      : `⚠️ Signed up but the user was not found in MongoDB: ${ADMIN_EMAIL}`
  );

  await client.close();
}

main().catch((error) => {
  console.error('Admin seed failed:', error.message);
  process.exit(1);
});
