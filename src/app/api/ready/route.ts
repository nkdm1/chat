import { sql } from "drizzle-orm";
import { db } from "@/db";
import { messageStore } from "@/server/messages";
import { realtime } from "@/server/realtime";
import { redisReady } from "@/server/redis";

async function check(fn: () => Promise<unknown>) {
  try {
    await fn();
    return "ok";
  } catch {
    return "down";
  }
}

// Readiness: PostgreSQL and Cosmos are required. Redis and Web PubSub only
// degrade features (fallbacks exist), so they're reported but don't fail it.
export async function GET() {
  const [postgres, cosmos, webpubsub] = await Promise.all([
    check(async () => await db.execute(sql`select 1`)),
    check(async () => await messageStore().ping()),
    check(async () => await realtime().ping()),
  ]);
  const redis = redisReady() ? "ok" : "degraded";
  const ready = postgres === "ok" && cosmos === "ok";
  return Response.json(
    {
      status: ready ? "ready" : "not-ready",
      postgres,
      cosmos,
      redis,
      webpubsub,
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
