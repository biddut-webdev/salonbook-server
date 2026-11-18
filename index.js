import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { toNodeHandler } from 'better-auth/node';
import { connectToMongoDB, getDb } from './lib/db.js';
import { createAuth } from './lib/auth.js';
import servicesRouter from './routes/services.js';

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

app.get('/', (req, res) => {
  res.send('Hello World!');
});

async function startServer() {
  try {
    await connectToMongoDB();

    const auth = createAuth(getDb());

    // Better Auth must be mounted BEFORE express.json():
    // the body parser would otherwise consume the request body first.
    app.all('/api/auth/*splat', toNodeHandler(auth));

    // JSON parsing for all of our own REST routes.
    app.use(express.json());

    // Public REST routes
    app.use('/api/services', servicesRouter);

    // Unknown /api route -> JSON 404 instead of an HTML page.
    app.use('/api', (req, res) => {
      res.status(404).json({ success: false, message: 'API route not found.' });
    });

    // Central error handler: every route can just call next(error).
    app.use((error, req, res, next) => {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Something went wrong on the server.',
      });
    });

    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

startServer();
