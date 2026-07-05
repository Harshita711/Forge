import { redis } from './redis';

// One atomic Lua script per check: ZADD the request, ZREMRANGEBYSCORE to trim
// expired members, ZCARD to count what remains, all in one round trip —
// avoids the race condition of doing those as three separate calls (Section 5.3).
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = now + windowMs
  if oldest[2] ~= nil then
    resetAt = tonumber(oldest[2]) + windowMs
  end
  return {0, count, resetAt}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
return {1, count + 1, now + windowMs}
`;

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number; // epoch ms
}

// Section 11.5: applied per (organization, endpoint class). Default job
// submission tier is 120 req/min per organization (Table: "Job submission").
export async function checkRateLimit(
  scopeKey: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const key = `ratelimit:${scopeKey}`;

  const [allowedRaw, countRaw, resetAtRaw] = (await redis.eval(
    SLIDING_WINDOW_SCRIPT,
    1,
    key,
    now,
    windowMs,
    limit,
    member
  )) as [number, number, number];

  return {
    allowed: allowedRaw === 1,
    count: countRaw,
    limit,
    resetAt: resetAtRaw,
  };
}
