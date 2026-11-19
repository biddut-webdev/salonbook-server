
import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_BASE_URL = (
  process.env.BETTER_AUTH_URL || "http://localhost:5000"
).replace(/\/$/, "");

const JWKS = createRemoteJWKSet(
  new URL(`${AUTH_BASE_URL}/api/auth/jwks`)
);

export const verifyJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized. Token required.",
      });
    }

    const token = authHeader.slice(7);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_BASE_URL,
      audience: AUTH_BASE_URL,
    });

    if (!payload.sub) {
      return res.status(401).send({
        success: false,
        message: "Invalid token.",
      });
    }

    req.user = {
      ...payload,
      id: payload.sub,
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).send({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized.",
      });
    }

    if (req.user.role !== role) {
      return res.status(403).send({
        success: false,
        message: "Access denied.",
      });
    }

    next();
  };
};
