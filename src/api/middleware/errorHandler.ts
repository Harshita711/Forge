import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../domain/errors';
import { logger } from '../../lib/logger';

// Wraps an async Express handler so thrown/rejected errors reach errorHandler
// instead of crashing the process — avoids repeating try/catch in every controller.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request failed validation',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, correlationId: req.headers['x-correlation-id'] }, err.message);
    }
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  const correlationId = (req.headers['x-correlation-id'] as string) || req.id;
  logger.error({ err, correlationId }, 'Unhandled exception');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: [{ correlationId }],
    },
  });
}
