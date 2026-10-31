import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachment,
  conversation,
  messageReaction,
  messageReport,
  messageStatsDaily,
  user,
} from "@/db/schema";
import type { REACTION_EMOJI } from "@/lib/validation";
import { MESSAGE_MAX } from "@/lib/validation";
import {
  memberIds,
  membersWithNames,
  requireMember,
} from "@/server/conversations";
import { areFriends } from "@/server/friends";
import type { SessionUser } from "@/server/http";
import { ApiError, badRequest, forbidden, notFound } from "@/server/http";
import { realtime } from "@/server/realtime";
import { sanitizeText } from "@/server/sanitize";
import { countMessage, markMentioned } from "@/server/unread";
import { messageStore } from "./index";
import type { AttachmentRef, MessageDoc } from "./types";
import { EtagMismatchError } from "./types";

const PREVIEW = 120;
const preview = (text: string) =>
  text.length > PREVIEW ? `${text.slice(0, PREVIEW - 1)}…` : text;

/** Deterministic id: a retried send maps to the same document (Cosmos 409). */
export function messageIdFor(senderId: string, clientMessageId: string) {
  return createHash("sha256")
    .update(`${senderId}:${clientMessageId}`)
    .digest("hex")
    .slice(0, 32);
}

export type Reaction = { emoji: string; userIds: string[] };
export type MessageView = Omit<MessageDoc, "mentions"> & {
  mentions: string[];
  senderName: string;
  reactions: Reaction[];
};

function cleanBody(raw: string) {
  const body = sanitizeText(raw);
  if (body.length > MESSAGE_MAX) {
    throw badRequest(
      `Messages are limited to ${MESSAGE_MAX} characters`,
      "MESSAGE_TOO_LONG",
    );
  }
  return body;
}

/** `@username` tokens that match members (never trust a client-sent list). */
function findMentions(
  body: string,
  members: { userId: string; username: string }[],
  senderId: string,
) {
  const names = new Set(
    [...body.matchAll(/@([a-z0-9_]{3,24})\b/gi)].map((m) => m[1].toLowerCase()),
  );
  return members
    .filter((m) => names.has(m.username) && m.userId !== senderId)
    .map((m) => m.userId);
}

async function hydrate(docs: MessageDoc[]): Promise<MessageView[]> {
  if (docs.length === 0) {
    return [];
  }
  const ids = docs.map((d) => d.id);
  const senderIds = [...new Set(docs.map((d) => d.senderId))];
  const [reactions, senders] = await Promise.all([
    db
      .select({
        messageId: messageReaction.messageId,
        emoji: messageReaction.emoji,
        userId: messageReaction.userId,
      })
      .from(messageReaction)
      .where(inArray(messageReaction.messageId, ids))
      .orderBy(messageReaction.createdAt),
    db
      .select({ id: user.id, username: user.username })
      .from(user)
      .where(inArray(user.id, senderIds)),
  ]);
  const names = new Map(senders.map((s) => [s.id, s.username]));
  const byMessage = new Map<string, Reaction[]>();
  for (const r of reactions) {
    const list = byMessage.get(r.messageId) ?? [];
    const entry = list.find((e) => e.emoji === r.emoji);
    if (entry) {
      entry.userIds.push(r.userId);
    } else {
      list.push({ emoji: r.emoji, userIds: [r.userId] });
    }
    byMessage.set(r.messageId, list);
  }
  return docs.map((d) => ({
    ...d,
    senderName: names.get(d.senderId) ?? "deleted user",
    reactions: d.deletedAt ? [] : (byMessage.get(d.id) ?? []),
  }));
}

type SendInput = {
  body: string;
  clientMessageId: string;
  attachmentIds: string[];
  replyToId?: string;
};

type Member = { userId: string; username: string };

async function requireCanSend(
  me: SessionUser,
  type: "direct" | "group",
  members: Member[],
) {
  if (type !== "direct") {
    return;
  }
  const peer = members.find((m) => m.userId !== me.id);
  if (!peer || !(await areFriends(me.id, peer.userId))) {
    throw new ApiError(
      403,
      "NOT_FRIENDS",
      "You're no longer friends with this person",
    );
  }
}

/** The sender's own uploads in this conversation, not yet sent elsewhere. */
async function resolveAttachments(
  senderId: string,
  conversationId: string,
  messageId: string,
  ids: string[],
): Promise<AttachmentRef[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select()
    .from(attachment)
    .where(
      and(
        inArray(attachment.id, ids),
        eq(attachment.uploaderId, senderId),
        eq(attachment.conversationId, conversationId),
        or(isNull(attachment.messageId), eq(attachment.messageId, messageId)),
      ),
    );
  if (rows.length !== new Set(ids).size) {
    throw badRequest("Unknown attachment", "INVALID_ATTACHMENT");
  }
  return rows.map((a) => ({
    id: a.id,
    name: a.originalName,
    mime: a.mime,
    size: a.size,
  }));
}

/** Snapshot of the replied-to message; same partition, so same conversation. */
async function resolveReply(conversationId: string, replyToId?: string) {
  if (!replyToId) {
    return undefined;
  }
  const target = await messageStore().get(conversationId, replyToId);
  if (!target || target.doc.deletedAt) {
    throw badRequest("Original message not found", "INVALID_REPLY");
  }
  const { doc } = target;
  return {
    id: doc.id,
    senderId: doc.senderId,
    preview: preview(doc.body || (doc.attachments.length ? "Attachment" : "")),
  };
}

/** Idempotent, so a retried send completes whatever a crash interrupted. */
async function applySideEffects(
  doc: MessageDoc,
  created: boolean,
  members: Member[],
) {
  const at = new Date(doc.createdAt);
  if (doc.attachments.length) {
    await db
      .update(attachment)
      .set({ messageId: doc.id })
      .where(
        and(
          inArray(
            attachment.id,
            doc.attachments.map((a) => a.id),
          ),
          isNull(attachment.messageId),
        ),
      );
  }
  await db
    .update(conversation)
    .set({
      lastMessageAt: at,
      lastMessagePreview: preview(doc.body || "Sent an attachment"),
      lastMessageSenderId: doc.senderId,
    })
    .where(
      and(
        eq(conversation.id, doc.conversationId),
        or(
          isNull(conversation.lastMessageAt),
          lt(conversation.lastMessageAt, at),
        ),
      ),
    );
  if (created) {
    await db
      .insert(messageStatsDaily)
      .values({ day: doc.createdAt.slice(0, 10), count: 1 })
      .onConflictDoUpdate({
        target: messageStatsDaily.day,
        set: { count: sql`${messageStatsDaily.count} + 1` },
      });
  }
  const recipients = members
    .map((m) => m.userId)
    .filter((id) => id !== doc.senderId);
  await countMessage(doc.id, doc.conversationId, recipients);
  await markMentioned(doc.conversationId, doc.mentions);
}

export async function sendMessage(
  me: SessionUser,
  conversationId: string,
  input: SendInput,
) {
  const { conversation: c } = await requireMember(me.id, conversationId);
  const members = await membersWithNames(conversationId);
  await requireCanSend(me, c.type, members);

  const body = cleanBody(input.body);
  const id = messageIdFor(me.id, input.clientMessageId);
  const attachments = await resolveAttachments(
    me.id,
    conversationId,
    id,
    input.attachmentIds,
  );
  if (!body && attachments.length === 0) {
    throw badRequest("Message is empty", "EMPTY_MESSAGE");
  }
  const replyTo = await resolveReply(conversationId, input.replyToId);

  const createdAt = new Date().toISOString();
  const { doc, created } = await messageStore().create({
    id,
    conversationId,
    senderId: me.id,
    body,
    attachments,
    ...(replyTo ? { replyTo } : {}),
    mentions: findMentions(body, members, me.id),
    createdAt,
    sortKey: `${createdAt}_${id}`,
  });
  await applySideEffects(doc, created, members);

  const [view] = await hydrate([doc]);
  await realtime().toUsers(
    members.map((m) => m.userId),
    { type: "message.created", conversationId, message: view },
  );
  return view;
}

export async function listMessages(
  userId: string,
  conversationId: string,
  opts: { before?: string; around?: string; limit: number },
) {
  await requireMember(userId, conversationId);
  const store = messageStore();
  if (opts.around) {
    const half = Math.ceil(opts.limit / 2);
    const [older, newer] = await Promise.all([
      store.page(conversationId, half, opts.around),
      store.after(conversationId, opts.around, half + 1),
    ]);
    return {
      messages: await hydrate([...older.toReversed(), ...newer]),
      hasMore: older.length === half,
      hasNewer: newer.length > half,
    };
  }
  const docs = await store.page(conversationId, opts.limit + 1, opts.before);
  const hasMore = docs.length > opts.limit;
  // The store returns newest first; render oldest first.
  const page = docs.slice(0, opts.limit).toReversed();
  return { messages: await hydrate(page), hasMore, hasNewer: false };
}

async function loadOwnable(
  me: SessionUser,
  conversationId: string,
  messageId: string,
) {
  // Admins moderate without being members.
  const membership = await requireMember(me.id, conversationId).catch(
    (error: unknown) => {
      if (me.role === "admin") {
        return null;
      }
      throw error;
    },
  );
  const found = await messageStore().get(conversationId, messageId);
  if (!found) {
    throw notFound("Message not found");
  }
  return { ...found, membership };
}

export async function editMessage(
  me: SessionUser,
  conversationId: string,
  messageId: string,
  rawBody: string,
) {
  const { doc, etag, membership } = await loadOwnable(
    me,
    conversationId,
    messageId,
  );
  if (!membership || doc.senderId !== me.id) {
    throw forbidden("You can only edit your own messages");
  }
  if (doc.deletedAt) {
    throw badRequest("Message was deleted", "MESSAGE_DELETED");
  }
  const body = cleanBody(rawBody);
  if (!body && doc.attachments.length === 0) {
    throw badRequest("Message is empty", "EMPTY_MESSAGE");
  }
  const members = await membersWithNames(conversationId);
  try {
    const updated = await messageStore().replace(
      {
        ...doc,
        body,
        mentions: findMentions(body, members, me.id),
        editedAt: new Date().toISOString(),
      },
      etag,
    );
    const [view] = await hydrate([updated]);
    await realtime().toUsers(
      members.map((m) => m.userId),
      {
        type: "message.updated",
        conversationId,
        message: view,
      },
    );
    return view;
  } catch (error) {
    if (error instanceof EtagMismatchError) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Message changed meanwhile. Try again.",
      );
    }
    throw error;
  }
}

/** Soft delete: own message, the group owner, or an admin. */
export async function deleteMessage(
  me: SessionUser,
  conversationId: string,
  messageId: string,
) {
  const { doc, etag, membership } = await loadOwnable(
    me,
    conversationId,
    messageId,
  );
  const isOwner =
    membership?.conversation.type === "group" &&
    membership.member.role === "owner";
  const allowed =
    (membership && doc.senderId === me.id) || isOwner || me.role === "admin";
  if (!allowed) {
    throw forbidden("You can't delete this message");
  }
  if (doc.deletedAt) {
    return { id: doc.id };
  }
  const { replyTo: _r, ...rest } = doc;
  try {
    await messageStore().replace(
      {
        ...rest,
        body: "",
        attachments: [],
        mentions: [],
        deletedAt: new Date().toISOString(),
      },
      etag,
    );
  } catch (error) {
    if (error instanceof EtagMismatchError) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Message changed meanwhile. Try again.",
      );
    }
    throw error;
  }
  await db.delete(messageReaction).where(eq(messageReaction.messageId, doc.id));
  await realtime().toUsers(await memberIds(conversationId), {
    type: "message.deleted",
    conversationId,
    messageId: doc.id,
  });
  return { id: doc.id };
}

export async function searchMessages(
  userId: string,
  conversationId: string,
  q: string,
) {
  await requireMember(userId, conversationId);
  return await hydrate(await messageStore().search(conversationId, q, 20));
}

export async function toggleReaction(
  userId: string,
  conversationId: string,
  messageId: string,
  emoji: (typeof REACTION_EMOJI)[number],
) {
  await requireMember(userId, conversationId);
  const found = await messageStore().get(conversationId, messageId);
  if (!found || found.doc.deletedAt) {
    throw notFound("Message not found");
  }
  const where = and(
    eq(messageReaction.messageId, messageId),
    eq(messageReaction.userId, userId),
    eq(messageReaction.emoji, emoji),
  );
  const removed = await db.delete(messageReaction).where(where).returning();
  if (removed.length === 0) {
    await db
      .insert(messageReaction)
      .values({ messageId, userId, emoji, conversationId })
      .onConflictDoNothing();
  }
  const [view] = await hydrate([found.doc]);
  await realtime().toUsers(await memberIds(conversationId), {
    type: "message.reactions",
    conversationId,
    messageId,
    reactions: view.reactions,
  });
  return { reactions: view.reactions };
}

export async function reportMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  input: {
    reason: "spam" | "harassment" | "inappropriate" | "other";
    details?: string;
  },
) {
  await requireMember(userId, conversationId);
  const found = await messageStore().get(conversationId, messageId);
  if (!found || found.doc.deletedAt) {
    throw notFound("Message not found");
  }
  if (found.doc.senderId === userId) {
    throw badRequest("You can't report your own message");
  }
  const [row] = await db
    .insert(messageReport)
    .values({
      messageId,
      conversationId,
      messageSenderId: found.doc.senderId,
      reporterId: userId,
      reason: input.reason,
      details: input.details ? sanitizeText(input.details) : null,
      bodySnapshot: found.doc.body,
      attachmentIds: found.doc.attachments.map((a) => a.id),
    })
    .onConflictDoNothing()
    .returning({ id: messageReport.id });
  if (!row) {
    throw new ApiError(
      409,
      "ALREADY_REPORTED",
      "You already reported this message",
    );
  }
  return { id: row.id };
}
