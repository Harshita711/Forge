import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { correlationId } from './middleware/correlationId';
import { errorHandler } from './middleware/errorHandler';
import { v1Router } from './routes';

export function createApp(): Express {
  const app = express();

  // Security headers (Section 14.5): CSP with no inline/eval, nosniff, deny framing.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    })
  );

  // CORS allowlists exactly the dashboard's own origin (Section 14.5) — never a
  // wildcard, since the API sets a credentialed cookie (the refresh token).
  app.use(
    cors({
      origin: process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173',
      credentials: true,
    })
  );

  app.use(correlationId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { id: string }).id,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Unversioned probes (Table 55) — orchestrator liveness/readiness checks
  // that must not depend on version negotiation.
  app.get('/health/live', (_req, res) => {
    res.status(200).json({ data: { status: 'healthy' } });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ data: { status: 'healthy' } });
    } catch (err) {
      logger.error({ err }, 'Readiness check failed: database unreachable');
      res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Database unreachable' },
      });
    }
  });

  app.use('/v1', v1Router);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
  });

  app.use(errorHandler);

  return app;
}
