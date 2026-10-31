import { randomUUID } from "node:crypto";
import type { MessageDoc, MessageStore } from "@/server/messages/types";
import { EtagMismatchError } from "@/server/messages/types";

/** Same contract as the Cosmos store, in memory. */
export class InMemoryMessageStore implements MessageStore {
  private readonly docs = new Map<string, { doc: MessageDoc; etag: string }>();

  private key(conversationId: string, id: string) {
    return `${conversationId}/${id}`;
  }

  private all(conversationId: string) {
    return [...this.docs.values()]
      .map((v) => v.doc)
      .filter((d) => d.conversationId === conversationId);
  }

  async create(doc: MessageDoc) {
    const existing = this.docs.get(this.key(doc.conversationId, doc.id));
    if (existing) {
      return { doc: structuredClone(existing.doc), created: false };
    }
    this.docs.set(this.key(doc.conversationId, doc.id), {
      doc: structuredClone(doc),
      etag: randomUUID(),
    });
    return { doc: structuredClone(doc), created: true };
  }

  async get(conversationId: string, id: string) {
    const item = this.docs.get(this.key(conversationId, id));
    return item ? { doc: structuredClone(item.doc), etag: item.etag } : null;
  }

  async replace(doc: MessageDoc, etag: string) {
    const key = this.key(doc.conversationId, doc.id);
    if (this.docs.get(key)?.etag !== etag) {
      throw new EtagMismatchError();
    }
    this.docs.set(key, { doc: structuredClone(doc), etag: randomUUID() });
    return structuredClone(doc);
  }

  async page(conversationId: string, limit: number, before?: string) {
    return this.all(conversationId)
      .filter((d) => !before || d.sortKey < before)
      .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
      .slice(0, limit);
  }

  async after(conversationId: string, sortKey: string, limit: number) {
    return this.all(conversationId)
      .filter((d) => d.sortKey >= sortKey)
      .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
      .slice(0, limit);
  }

  async countUnread(conversationId: string, since: string, readerId: string) {
    return this.all(conversationId).filter(
      (d) => d.createdAt > since && d.senderId !== readerId && !d.deletedAt,
    ).length;
  }

  async search(conversationId: string, query: string, limit: number) {
    const q = query.toLowerCase();
    return this.all(conversationId)
      .filter((d) => !d.deletedAt && d.body.toLowerCase().includes(q))
      .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
      .slice(0, limit);
  }

  async ping() {}
  async init() {}

  clear() {
    this.docs.clear();
  }
}
