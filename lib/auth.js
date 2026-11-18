import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

/**
 * Creates the Better Auth instance.
 * Called once at server start, right after the MongoDB connection is ready.
 *
 * @param {import("mongodb").Db} db - the MongoDB database instance
 */
export function createAuth(db) {
  // Google login is enabled only when its credentials exist in .env,
  // so the server still starts if they are missing.
  const socialProviders = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }

  return betterAuth({
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",

    // The Next.js app is a different origin, so it must be trusted.
    trustedOrigins: [process.env.CLIENT_URL || "http://localhost:3000"],

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
    },

    // Cross-site cookies in production (client and server on different domains).
    advanced: {
      defaultCookieAttributes: {
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },

    socialProviders,

    user: {
      // Extra fields on top of Better Auth's default user fields.
      additionalFields: {
        // "input: false" means users can never set these through sign-up
        // or profile update — only the server/admin can change them.
        role: {
          type: "string",
          defaultValue: "customer",
          input: false,
        },
        isBlocked: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
      },
    },
  });
}
