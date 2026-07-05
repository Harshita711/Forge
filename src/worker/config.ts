export const WORKER_CONFIG = {
  capacity: Number(process.env.WORKER_CAPACITY ?? 5),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 1000),
  heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS ?? 10_000),
  shutdownGracePeriodMs: Number(process.env.SHUTDOWN_GRACE_PERIOD_MS ?? 30_000),
  defaultVisibilityTimeoutSeconds: Number(process.env.VISIBILITY_TIMEOUT_SECONDS ?? 30),
};

// Section 8.1: jitter avoids synchronized polling herds across worker replicas.
export function pollJitterMs(): number {
  return Math.floor(Math.random() * 250);
}
