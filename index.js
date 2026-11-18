import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { toNodeHandler } from 'better-auth/node';
import { createAuth } from './lib/auth.js';

const app = express();

app.use(
  cors({
    // Frontend origin from env. `credentials: true` is required because
    // Better Auth sends cookies with its requests (wildcard "*" is not allowed then).
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);

const port = process.env.PORT || 5000;

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('You successfully connected to MongoDB!');
    return client;
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    throw err;
  }
}

app.get('/', (req, res) => {
  res.send('Hello World!');
});

async function startServer() {
  try {
    await connectToMongoDB();

    const db = client.db(process.env.MONGODB_DB || 'salonbook');
    const auth = createAuth(db);

    // Better Auth must be mounted BEFORE express.json():
    // the body parser would otherwise consume the request body first.
    app.all('/api/auth/*splat', toNodeHandler(auth));

    // JSON parsing for all of our own REST routes.
    app.use(express.json());

    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

startServer();
