import { MemoryTtl, withFallback } from "@/server/redis";

const TTL = 3;
const memory = new MemoryTtl<"1">();

/** SET NX EX: returns true only when the user wasn't already marked as typing,
 *  so repeated keystrokes publish at most one event per TTL window. */
export async function markTyping(conversationId: string, userId: string) {
  const key = `typing:${conversationId}:${userId}`;
  return await withFallback(
    async (r) => (await r.set(key, "1", "EX", TTL, "NX")) === "OK",
    () => memory.setIfAbsent(key, "1", TTL),
  );
}
