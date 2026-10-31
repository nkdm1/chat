import { messageStore } from "@/server/messages";
import { withFallback } from "@/server/redis";

// Unread counters are derived data: Redis hash unread:{userId} -> {convId: n}.
// PostgreSQL's last_read_at is the source of truth, so a missing or lost
// counter is rebuilt from Cosmos (messages after last_read_at, not mine).

const APPLIED_TTL = 60 * 60 * 24;

/** Increments each recipient's counter exactly once per message (retry-safe). */
export async function countMessage(
  messageId: string,
  conversationId: string,
  recipientIds: string[],
) {
  await withFallback(
    async (r) => {
      const first = await r.set(
        `unread-applied:${messageId}`,
        "1",
        "EX",
        APPLIED_TTL,
        "NX",
      );
      if (first !== "OK") {
        return;
      }
      const pipeline = r.pipeline();
      for (const id of recipientIds) {
        pipeline.hincrby(`unread:${id}`, conversationId, 1);
      }
      await pipeline.exec();
    },
    () => undefined, // nothing to do: counts are rebuilt from Cosmos on read
  );
}

/** "@" badge: conversations where the user was mentioned since last read. */
export async function markMentioned(conversationId: string, userIds: string[]) {
  if (userIds.length === 0) {
    return;
  }
  await withFallback(
    async (r) => {
      const pipeline = r.pipeline();
      for (const id of userIds) {
        pipeline.sadd(`mentions:${id}`, conversationId);
      }
      await pipeline.exec();
    },
    () => undefined,
  );
}

export async function mentionFlags(userId: string) {
  return new Set(
    await withFallback<string[]>(
      async (r) => await r.smembers(`mentions:${userId}`),
      () => [],
    ),
  );
}

export async function clearUnread(userId: string, conversationId: string) {
  await withFallback(
    async (r) => {
      await r
        .pipeline()
        .hdel(`unread:${userId}`, conversationId)
        .srem(`mentions:${userId}`, conversationId)
        .exec();
    },
    () => undefined,
  );
}

/** Unread counts for a user's conversations; rebuilds missing entries. */
export async function unreadCounts(
  userId: string,
  conversations: { id: string; lastReadAt: Date | null; joinedAt: Date }[],
) {
  const cached = await withFallback<Record<string, string>>(
    async (r) => await r.hgetall(`unread:${userId}`),
    () => ({}),
  );
  const result: Record<string, number> = {};
  const rebuilt: Record<string, number> = {};
  await Promise.all(
    conversations.map(async (c) => {
      if (cached[c.id] !== undefined) {
        result[c.id] = Number(cached[c.id]);
        return;
      }
      const since = (c.lastReadAt ?? c.joinedAt).toISOString();
      try {
        result[c.id] = await messageStore().countUnread(c.id, since, userId);
        rebuilt[c.id] = result[c.id];
      } catch {
        result[c.id] = 0; // Cosmos down: show nothing rather than fail the list
      }
    }),
  );
  if (Object.keys(rebuilt).length) {
    await withFallback(
      async (r) => {
        // HSETNX: don't clobber increments that raced with the rebuild.
        const pipeline = r.pipeline();
        for (const [id, n] of Object.entries(rebuilt)) {
          pipeline.hsetnx(`unread:${userId}`, id, n);
        }
        await pipeline.exec();
      },
      () => undefined,
    );
  }
  return result;
}
