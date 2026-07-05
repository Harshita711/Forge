import { v4 as uuidv4 } from 'uuid';
import { redis } from './redis';

// Lua scripts so read-verify-write is atomic — otherwise a lock could be
// renewed/released after it already passed to a new owner (Section 5.2).
const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export interface DistributedLock {
  key: string;
  ownerToken: string;
}

// SET NX PX rather than full Redlock — Forge's Redis is a single logical
// instance with a replica for failover, not a quorum of independent masters,
// so Redlock would be solving a problem this deployment doesn't have (Section 5.2).
export async function acquireLock(key: string, ttlMs: number): Promise<DistributedLock | null> {
  const ownerToken = uuidv4();
  const result = await redis.set(key, ownerToken, 'PX', ttlMs, 'NX');
  return result === 'OK' ? { key, ownerToken } : null;
}

export async function renewLock(lock: DistributedLock, ttlMs: number): Promise<boolean> {
  const result = await redis.eval(RENEW_SCRIPT, 1, lock.key, lock.ownerToken, ttlMs);
  return result === 1;
}

export async function releaseLock(lock: DistributedLock): Promise<boolean> {
  const result = await redis.eval(RELEASE_SCRIPT, 1, lock.key, lock.ownerToken);
  return result === 1;
}

// Convenience wrapper for the common "try to become leader, retry on a short
// interval" pattern (Section 7.1) used by the Scheduler.
export async function acquireOrRetryLeadership(
  key: string,
  ttlMs: number,
  retryIntervalMs: number,
  onAcquired: (lock: DistributedLock) => void,
  isStopped: () => boolean
): Promise<void> {
  while (!isStopped()) {
    const lock = await acquireLock(key, ttlMs);
    if (lock) {
      onAcquired(lock);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }
}
