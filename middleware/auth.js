import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';

const jwks = createRemoteJWKSet(
  new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`),
);

export async function verifyJWT(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res
        .status(401)
        .json({ success: false, message: 'Authentication required.' });
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer: process.env.BETTER_AUTH_URL,
      audience: process.env.BETTER_AUTH_URL,
    });

    if (!ObjectId.isValid(payload.sub)) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid session token.' });
    }

    const user = await getDb()
      .collection('user')
      .findOne({ _id: new ObjectId(payload.sub) });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'User no longer exists.' });
    }

    if (user.isBlocked) {
      return res
        .status(403)
        .json({ success: false, message: 'Your account has been blocked.' });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role || 'customer',
    };

    next();
  } catch (error) {
    // Token problems -> 401. Anything else (e.g. database down) -> 500.
    if (error instanceof joseErrors.JOSEError) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid or expired token.' });
    }

    console.error('verifyJWT failed:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Authentication check failed.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }

    next();
  };
}