import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../../domain/errors';
import { Permission } from '../../domain/permissions';
import { hasEffectivePermission } from '../services/rbacResolution';
import { prisma } from '../../lib/prisma';

export interface AccessTokenPayload {
  sub: string; // user id
  orgIds: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    // Fails fast at startup-adjacent code paths rather than silently signing
    // with an empty/undefined secret (Section 14.8 — required, no default).
    throw new Error('JWT_ACCESS_SECRET is required and has no default');
  }
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const ttl = process.env.JWT_ACCESS_TTL || '15m';
  const options: jwt.SignOptions = { expiresIn: ttl as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, getAccessSecret(), options);
}

// Every request except the public auth endpoints and /health/* requires a
// valid Bearer access token (Section 12.1 Table 58 — Authentication row).
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(AppError.unauthenticated());
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, getAccessSecret()) as AccessTokenPayload;
    req.user = payload;
    next();
  } catch {
    next(AppError.unauthenticated());
  }
}

// Loads the caller's coarse role within :organizationId (path param) and
// checks it against the required permission (Table 49). A member of another
// organization gets NOT_FOUND, never FORBIDDEN — Section 14.1's IDOR mitigation.
export function requirePermission(permission: Permission, orgIdParam = 'organizationId') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(AppError.unauthenticated());
      const organizationId = req.params[orgIdParam];
      if (!organizationId) return next(AppError.notFound());

      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: req.user.sub } },
      });
      if (!membership) {
        return next(AppError.notFound());
      }
      if (!(await hasEffectivePermission(membership, permission))) {
        return next(AppError.forbidden());
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
