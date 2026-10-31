import { MemoryTtl, withFallback } from "@/server/redis";

// Heartbeat-based presence: the client pings every 30 s while the tab is
// visible; the key expires 60 s after the last ping. Best effort, not durable.
const TTL = 60;
const memory = new MemoryTtl<"1">();

export async function heartbeat(userId: string) {
  const key = `presence:${userId}`;
  return await withFallback(
    async (r) => (await r.set(key, "1", "EX", TTL, "GET")) === null,
    () => {
      const wasOnline = memory.get(key) !== undefined;
      memory.set(key, "1", TTL);
      return !wasOnline;
    },
  ); // true when the user just came online
}

export async function onlineSet(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }
  const keys = userIds.map((id) => `presence:${id}`);
  const values = await withFallback(
    async (r) => await r.mget(keys),
    () => keys.map((k) => memory.get(k) ?? null),
  );
  return new Set(userIds.filter((_, i) => values[i] !== null));
}

export async function onlineCount() {
  return await withFallback(
    async (r) => {
      let count = 0;
      let cursor = "0";
      do {
        const [next, batch] = await r.scan(
          cursor,
          "MATCH",
          "presence:*",
          "COUNT",
          500,
        );
        cursor = next;
        count += batch.length;
      } while (cursor !== "0");
      return count;
    },
    () => memory.keys("presence:").length,
  );
}
