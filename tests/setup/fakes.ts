import { setMessageStore } from "@/server/messages";
import type { RealtimeEvent } from "@/server/realtime";
import { setPublisher } from "@/server/realtime";
import { InMemoryMessageStore } from "../support/memory-message-store";

// Runs before each test file: messages in memory, realtime pushes recorded.
export const store = new InMemoryMessageStore();
export const published: { userIds: string[]; event: RealtimeEvent }[] = [];
export const disconnected: string[] = [];

setMessageStore(store);
setPublisher({
  async clientUrl(userId) {
    return `ws://realtime.test/client/hubs/chat?user=${userId}`;
  },
  async toUsers(userIds, event) {
    published.push({ userIds, event });
  },
  async disconnectUser(userId) {
    disconnected.push(userId);
  },
  async ping() {},
});

export function resetFakes() {
  store.clear();
  published.length = 0;
  disconnected.length = 0;
}
