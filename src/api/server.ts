import 'dotenv/config';
import { createApp } from './app';
import { attachSocketServer } from './realtime/socket';
import { logger } from '../lib/logger';
import { disconnectPrisma } from '../lib/prisma';

const PORT = Number(process.env.PORT || 4000);

const app = createApp();
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Forge API listening');
});
attachSocketServer(server);

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down API service');
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
  // Force-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
