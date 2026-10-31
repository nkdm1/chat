export type AttachmentRef = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

/** One chat message as stored in Cosmos DB (partition key: conversationId). */
export type MessageDoc = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachments: AttachmentRef[];
  replyTo?: { id: string; senderId: string; preview: string };
  mentions: string[];
  createdAt: string; // ISO
  sortKey: string; // `${createdAt}_${id}`: the one sort/cursor field
  editedAt?: string;
  deletedAt?: string;
};

export class EtagMismatchError extends Error {
  constructor() {
    super("The message changed since it was read");
    this.name = "EtagMismatchError";
  }
}

/**
 * Every operation is scoped to one conversation (one Cosmos partition) and
 * sorts on one field, so no cross-partition queries or composite indexes.
 */
export interface MessageStore {
  /** Idempotent: creating an existing id returns the stored doc, created=false. */
  create(doc: MessageDoc): Promise<{ doc: MessageDoc; created: boolean }>;
  get(
    conversationId: string,
    id: string,
  ): Promise<{ doc: MessageDoc; etag: string } | null>;
  /** Optimistic concurrency: throws EtagMismatchError if the doc changed. */
  replace(doc: MessageDoc, etag: string): Promise<MessageDoc>;
  /** Newest first, strictly older than `before` (a sortKey) when given. */
  page(
    conversationId: string,
    limit: number,
    before?: string,
  ): Promise<MessageDoc[]>;
  /** Oldest first, starting at `sortKey` (inclusive). */
  after(
    conversationId: string,
    sortKey: string,
    limit: number,
  ): Promise<MessageDoc[]>;
  countUnread(
    conversationId: string,
    since: string,
    readerId: string,
  ): Promise<number>;
  search(
    conversationId: string,
    query: string,
    limit: number,
  ): Promise<MessageDoc[]>;
  ping(): Promise<void>;
  init(): Promise<void>;
}
