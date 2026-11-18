import { MongoClient } from 'mongodb';

let client;
let db;

/**
 * Connects to MongoDB once and stores the database instance.
 * All routes read it through getDb().
 */
export async function connectToMongoDB() {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'salonbook');
  console.log('You successfully connected to MongoDB!');
  return db;
}

/** Returns the connected database instance. */
export function getDb() {
  if (!db) {
    throw new Error('MongoDB is not connected yet.');
  }
  return db;
}
