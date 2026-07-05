export const SCHEDULER_CONFIG = {
  leaderLockKey: 'lock:scheduler:leader',
  leaderLockTtlMs: 5000,
  leaderRetryIntervalMs: 1000,
  promotionTickMs: Number(process.env.SCHEDULER_TICK_MS ?? 500),
  promotionBatchSize: 200,
  reaperTickMs: Number(process.env.REAPER_TICK_MS ?? 5000),
  reaperBatchSize: 200,
  metricsTickMs: Number(process.env.METRICS_TICK_MS ?? 30_000),
  workerTimeoutMs: Number(process.env.WORKER_TIMEOUT_MS ?? 30_000),
};
