import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CosmosMessageStore } from "@/server/messages/cosmos";
import type { MessageDoc, MessageStore } from "@/server/messages/types";
import { EtagMismatchError } from "@/server/messages/types";
import { InMemoryMessageStore } from "../support/memory-message-store";

// One contract, two implementations: the in-memory fake used by the other
// tests must behave like Cosmos. The Cosmos run needs the emulator
// (docker compose up -d cosmos) and is skipped when it isn't reachable.
const cosmosUp = await fetch("http://localhost:8081/")
  .then(() => true)
  .catch(() => false);

function doc(
  conversationId: string,
  i: number,
  extra: Partial<MessageDoc> = {},
): MessageDoc {
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
  const id = `m${i}`;
  return {
    id,
    conversationId,
    senderId: i % 2 ? "u1" : "u2",
    body: `message ${i}`,
    attachments: [],
    mentions: [],
    createdAt,
    sortKey: `${createdAt}_${id}`,
    ...extra,
  };
}

function contract(name: string, make: () => Promise<MessageStore>) {
  describe(name, () => {
    it("creates idempotently", async () => {
      const store = await make();
      const cid = randomUUID();
      const first = await store.create(doc(cid, 1));
      expect(first.created).toBe(true);
      const again = await store.create({ ...doc(cid, 1), body: "changed" });
      expect(again).toMatchObject({
        created: false,
        doc: { body: "message 1" },
      });
    });

    it("pages newest first and reads after a key", async () => {
      const store = await make();
      const cid = randomUUID();
      for (let i = 1; i <= 5; i++) {
        await store.create(doc(cid, i));
      }
      const page = await store.page(cid, 2);
      expect(page.map((d) => d.id)).toEqual(["m5", "m4"]);
      const older = await store.page(cid, 2, page[1].sortKey);
      expect(older.map((d) => d.id)).toEqual(["m3", "m2"]);
      const after = await store.after(cid, older[0].sortKey, 10);
      expect(after.map((d) => d.id)).toEqual(["m3", "m4", "m5"]);
    });

    it("replaces with optimistic concurrency", async () => {
      const store = await make();
      const cid = randomUUID();
      await store.create(doc(cid, 1));
      const found = await store.get(cid, "m1");
      if (!found) {
        throw new Error("missing");
      }
      await store.replace({ ...found.doc, body: "edited" }, found.etag);
      await expect(
        store.replace({ ...found.doc, body: "stale" }, found.etag),
      ).rejects.toBeInstanceOf(EtagMismatchError);
      const edited = await store.get(cid, "m1");
      expect(edited?.doc.body).toBe("edited");
      await expect(store.get(cid, "missing")).resolves.toBeNull();
    });

    it("counts unread and searches without deleted messages", async () => {
      const store = await make();
      const cid = randomUUID();
      await store.create(doc(cid, 1, { body: "Pizza?" }));
      await store.create(doc(cid, 2, { body: "pizza!" }));
      await store.create(
        doc(cid, 3, {
          body: "pizza gone",
          deletedAt: "2026-01-02T00:00:00.000Z",
        }),
      );
      await expect(
        store.countUnread(cid, "2000-01-01T00:00:00.000Z", "u2"),
      ).resolves.toBe(1);
      const found = await store.search(cid, "PIZZA", 10);
      expect(found.map((d) => d.id)).toEqual(["m2", "m1"]);
    });
  });
}

contract("in-memory message store", async () => new InMemoryMessageStore());

describe.skipIf(!cosmosUp)("Cosmos emulator", () => {
  contract("Cosmos message store", async () => {
    const store = new CosmosMessageStore();
    await store.init();
    return store;
  });
});
