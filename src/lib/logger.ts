import pino from 'pino';

// Structured JSON logging via Pino (Section 15.1) — never string-formatted text,
// so logs are machine-parseable by whatever aggregation the deployment provides.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
