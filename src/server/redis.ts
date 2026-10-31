import Redis from "ioredis";
import { env } from "@/lib/env";

// Redis holds derived/ephemeral data only (rate limits, presence, typing,
// unread counters). Every caller has an in-memory or database fallback, so the
// client is tuned to fail fast instead of queueing commands while Redis is down.
declare global {
  var redisClient: Redis | undefined;
}

function createClient() {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  let warned = false;
  client.on("error", (err) => {
    if (!warned) {
      console.warn(`[redis] unavailable, using fallbacks: ${err.message}`);
    }
    warned = true;
  });
  client.on("ready", () => {
    warned = false;
  });
  // Failures surface through the "error" listener above.
  client.connect().catch(() => undefined);
  return client;
}

export const redis = globalThis.redisClient ?? createClient();
if (env.NODE_ENV !== "production") {
  globalThis.redisClient = redis;
}

export function redisReady() {
  return redis.status === "ready";
}

/** Runs `primary` against Redis; on any Redis failure runs `fallback` instead. */
export async function withFallback<T>(
  primary: (r: Redis) => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  if (!redisReady()) {
    return await fallback();
  }
  try {
    return await primary(redis);
  } catch {
    return await fallback();
  }
}

/** Tiny TTL map used when Redis is unavailable (per process, best effort). */
export class MemoryTtl<V = string> {
  private readonly items = new Map<string, { value: V; expires: number }>();

  get(key: string) {
    const item = this.items.get(key);
    if (!item) {
      return undefined;
    }
    if (item.expires < Date.now()) {
      this.items.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key: string, value: V, ttlSeconds: number) {
    this.items.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }

  setIfAbsent(key: string, value: V, ttlSeconds: number) {
    if (this.get(key) !== undefined) {
      return false;
    }
    this.set(key, value, ttlSeconds);
    return true;
  }

  delete(key: string) {
    this.items.delete(key);
  }

  keys(prefix: string) {
    return [...this.items.keys()].filter(
      (k) => k.startsWith(prefix) && this.get(k) !== undefined,
    );
  }

  clear() {
    this.items.clear();
  }
}
