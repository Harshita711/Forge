import Redis from 'ioredis';

// Single shared ioredis connection per process (Section 5). Every service
// (API, Scheduler, Worker) that needs locks, rate limiting, or the lease
// mirror imports this one client.
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  // Section 1.2: partitions between a service and Redis degrade rate
  // limiting/locking gracefully rather than halting job execution — so this
  // is logged, not thrown, at the connection layer itself.
  // eslint-disable-next-line no-console
  console.error('[redis] connection error', err.message);
});

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
}
