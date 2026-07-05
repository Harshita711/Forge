import 'dotenv/config';
import { WorkerRuntime } from './runtime';
import { logger } from '../lib/logger';
import './handlerRegistry'; // side-effect import registers the demo handlers

const runtime = new WorkerRuntime();

runtime.start().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
