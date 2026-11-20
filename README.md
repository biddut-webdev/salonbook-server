# SalonBook — Server

SalonBook is a salon appointment booking platform. This repository contains the Express.js REST API, MongoDB integration, authentication and authorization, image-upload endpoint, and Stripe payment/webhook handling.

- **Live API:** https://salonbook-server-blue.vercel.app
- **Live client:** https://salonbook-client-seven.vercel.app
- **Client repository:** https://github.com/biddut-webdev/salonbook-client
- **Server repository:** https://github.com/biddut-webdev/salonbook-server

## Important Features

- REST API for salon services, appointments, profiles, users, and transactions
- MongoDB database integration
- Better Auth configuration with email/password authentication and optional Google OAuth
- JWT verification middleware and role-based API authorization
- Customer appointment and admin management endpoints
- ImgBB image upload endpoint for profile images
- Stripe Checkout session creation
- Stripe webhook signature verification; appointment payment status is updated from verified payment events
- Centralized API error handling and CORS configuration

## Technology Stack

- Node.js (ES Modules)
- Express 5
- MongoDB Node.js Driver
- Better Auth with MongoDB adapter
- JWT verification with jose
- Stripe
- Multer
- ImgBB API
- dotenv
- CORS

## Installation Instructions

1. Clone the server repository:

   ```bash
   git clone https://github.com/biddut-webdev/salonbook-server.git
   cd salonbook-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root and configure the required variables listed below. Use your own credentials; do not put real values in this README.

## Required Environment Variables

Configure these names in the server `.env` file:

- `PORT` (optional; defaults to `5000`)
- `MONGODB_URI`
- `MONGODB_DB` (optional; defaults to `salonbook`)
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `CLIENT_URL`
- `GOOGLE_CLIENT_ID` (optional; required for Google sign-in)
- `GOOGLE_CLIENT_SECRET` (optional; required for Google sign-in)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CURRENCY` (optional; defaults to `usd`)
- `IMGBB_API_KEY`

The admin seed script also supports these optional variables:

- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## How to Run the Project Locally

Start the API server in development mode:

```bash
npm run dev
```

The API runs at [http://localhost:5000](http://localhost:5000) by default.

To start it normally:

```bash
npm start
```

### Optional seed scripts

Insert the sample salon services (only when the services collection is empty):

```bash
npm run seed:services
```

Create or promote the configured admin account:

```bash
npm run seed:admin
```

Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env` before running the admin seed script. Use a strong password and keep these credentials private.

### Local Stripe webhook testing

For local Stripe CLI testing, forward Checkout events to the webhook endpoint:

```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```

Copy the webhook signing secret printed by Stripe CLI into `STRIPE_WEBHOOK_SECRET` in your local `.env` file, then restart the server.

## Live Website

- **Live client:** https://salonbook-client-seven.vercel.app
- **Live API:** https://salonbook-server-blue.vercel.app

## GitHub Repositories

- **Client:** https://github.com/biddut-webdev/salonbook-client
- **Server:** https://github.com/biddut-webdev/salonbook-server

## Security

- Never commit `.env`, API keys, OAuth credentials, Stripe secrets, database credentials, or admin passwords.
- Use environment variables for all credentials.
- Use Stripe's verified webhook events as the source of truth for successful payment status.
