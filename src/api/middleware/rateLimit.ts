import { NextFunction, Request, Response } from 'express';
import { checkRateLimit } from '../../lib/rateLimiter';
import { AppError } from '../../domain/errors';

// Section 11.5: every response carries X-RateLimit-* headers, and an
// over-limit request gets 429 + Retry-After rather than a bare rejection, so
// well-behaved clients can back off correctly instead of guessing.
export function rateLimit(endpointClass: string, limit: number, windowMs: number) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Requires requireAuth to have run first so req.user is populated;
      // falls back to IP for the (currently none) unauthenticated mutating routes.
      const orgScope = req.params.id || req.params.organizationId || 'unscoped';
      const scopeKey = `${req.user?.sub ?? req.ip}:${orgScope}:${endpointClass}`;
      const result = await checkRateLimit(scopeKey, limit, windowMs);

      _res.setHeader('X-RateLimit-Limit', String(result.limit));
      _res.setHeader('X-RateLimit-Remaining', String(Math.max(0, result.limit - result.count)));
      _res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

      if (!result.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
        _res.setHeader('Retry-After', String(retryAfterSeconds));
        return next(
          new AppError('RATE_LIMITED', `Rate limit exceeded for ${endpointClass}; retry after ${retryAfterSeconds}s`)
        );
      }
      next();
    } catch (err) {
      // Redis unavailable: degrade open rather than block job submission on a
      // coordination-layer outage (Section 1.2's stated partition-tolerance stance).
      next();
    }
  };
}

// Table: job submission tier — 120 req/min per organization by default.
export const jobSubmissionRateLimit = rateLimit('job:create', 120, 60_000);
