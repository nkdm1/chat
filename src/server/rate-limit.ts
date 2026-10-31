import { randomUUID } from "node:crypto";
import { withFallback } from "@/server/redis";

export type Limit = { max: number; windowSeconds: number };

// Only where abuse is real; everything else shares the catch-all "write" budget.
export const LIMITS = {
  message: { max: 10, windowSeconds: 10 },
  friendRequest: { max: 5, windowSeconds: 60 },
  friendRequestDaily: { max: 30, windowSeconds: 60 * 60 * 24 },
  upload: { max: 10, windowSeconds: 60 },
  report: { max: 10, windowSeconds: 60 * 60 },
  search: { max: 30, windowSeconds: 60 },
  write: { max: 120, windowSeconds: 60 },
} satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

export type LimitResult = { ok: true } | { ok: false; retryAfter: number };

// Sliding window: one sorted-set member per hit, scored by timestamp (ms).
const SLIDING_WINDOW = `
local key, now, window, max, member = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return tonumber(oldest[2]) + window - now
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return 0
`;

// Fallback when Redis is down: same algorithm, per process.
const memory = new Map<string, number[]>();

function memoryHit(key: string, limit: Limit, now: number): number {
  const windowMs = limit.windowSeconds * 1000;
  const hits = (memory.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit.max) {
    memory.set(key, hits);
    return hits[0] + windowMs - now;
  }
  hits.push(now);
  memory.set(key, hits);
  return 0;
}

export async function hit(
  name: LimitName,
  subject: string,
): Promise<LimitResult> {
  const limit = LIMITS[name];
  const key = `rl:${name}:${subject}`;
  const now = Date.now();
  const waitMs = await withFallback(
    async (r) =>
      Number(
        await r.eval(
          SLIDING_WINDOW,
          1,
          key,
          now,
          limit.windowSeconds * 1000,
          limit.max,
          `${now}-${randomUUID()}`,
        ),
      ),
    () => memoryHit(key, limit, now),
  );
  return waitMs > 0
    ? { ok: false, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) }
    : { ok: true };
}

export function resetMemoryLimits() {
  memory.clear();
}
