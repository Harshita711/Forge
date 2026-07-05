import Redis from 'ioredis';
import { redis } from './redis';
import { logger } from './logger';

const CHANNEL = 'forge:events';

export interface ForgeEvent {
  type: 'job:updated' | 'queue:updated' | 'worker:updated' | 'dlq:new';
  jobId?: string;
  queueId?: string;
  workerId?: string;
  payload: Record<string, unknown>;
}

export async function publishEvent(event: ForgeEvent): Promise<void> {
  try {
    await redis.publish(CHANNEL, JSON.stringify(event));
  } catch (err) {
    // Real-time push is a UX nice-to-have layered on top of the durable
    // Postgres state (Section 1.2) — a Redis hiccup here must never affect
    // job execution, so this is logged and swallowed, not thrown.
    logger.error({ err }, 'Failed to publish realtime event');
  }
}

// A dedicated connection is required for subscribe mode — ioredis puts a
// connection that issues SUBSCRIBE into a state where it can only receive
// pub/sub commands, so it cannot share the main client used for locks/rate
// limiting/regular commands.
export function subscribeToEvents(onEvent: (event: ForgeEvent) => void): Redis {
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true });
  subscriber.subscribe(CHANNEL).catch((err) => logger.error({ err }, 'Failed to subscribe to event channel'));
  subscriber.on('message', (_channel: string, message: string) => {
    try {
      onEvent(JSON.parse(message) as ForgeEvent);
    } catch (err) {
      logger.error({ err }, 'Failed to parse realtime event message');
    }
  });
  return subscriber;
}
