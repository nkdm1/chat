import { describe, expect, it } from "vitest";
import { hit, resetMemoryLimits } from "@/server/rate-limit";
import { redis } from "@/server/redis";

describe("rate limiter", () => {
  it("enforces the limit even without Redis (in-memory fallback)", async () => {
    redis.disconnect();
    resetMemoryLimits();
    const subject = `fallback-${Date.now()}`;
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(await hit("message", subject));
    }
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toMatchObject({ ok: false });
  });
});
