import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

// Every request gets a correlation ID: reused from an inbound X-Correlation-Id
// header if present, otherwise generated. Propagated into execution_events
// metadata by later phases so a request traces through to the job it triggers.
export function correlationId(req: Request, res: Response, next: NextFunction) {
  req.id = (req.headers['x-correlation-id'] as string) || uuidv4();
  res.setHeader('X-Correlation-Id', req.id);
  next();
}
