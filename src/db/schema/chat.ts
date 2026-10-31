import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// Relational chat data. Message bodies live in Cosmos DB (container
// "messages", partition key /conversationId); see src/server/messages.

const userRef = (name: string) =>
  text(name).references(() => user.id, { onDelete: "cascade" });

/** Personal 6-digit code another user types to send a friend request. */
export const friendCode = pgTable("friend_code", {
  userId: userRef("user_id").primaryKey(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const friendship = pgTable(
  "friendship",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: userRef("requester_id").notNull(),
    addresseeId: userRef("addressee_id").notNull(),
    status: text("status", { enum: ["pending", "accepted"] }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    respondedAt: timestamp("responded_at"),
  },
  (t) => [
    // One relationship per pair, whoever asked first.
    uniqueIndex("friendship_pair_idx").on(
      sql`least(${t.requesterId}, ${t.addresseeId})`,
      sql`greatest(${t.requesterId}, ${t.addresseeId})`,
    ),
    index("friendship_addressee_idx").on(t.addresseeId),
    index("friendship_requester_idx").on(t.requesterId),
    check("friendship_not_self", sql`${t.requesterId} <> ${t.addresseeId}`),
  ],
);

export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type", { enum: ["direct", "group"] }).notNull(),
    name: text("name"),
    // "minUserId:maxUserId" for DMs, so each pair has exactly one.
    directKey: text("direct_key").unique(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Denormalized from Cosmos for the conversation list.
    lastMessageAt: timestamp("last_message_at"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageSenderId: text("last_message_sender_id"),
  },
  (t) => [index("conversation_last_message_idx").on(t.lastMessageAt)],
);

export const conversationMember = pgTable(
  "conversation_member",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: userRef("user_id").notNull(),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    lastReadAt: timestamp("last_read_at", { precision: 3 }),
    mutedUntil: timestamp("muted_until"),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("conversation_member_user_idx").on(t.userId),
  ],
);

export const messageReaction = pgTable(
  "message_reaction",
  {
    messageId: text("message_id").notNull(),
    userId: userRef("user_id").notNull(),
    emoji: text("emoji").notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.userId] }),
    index("message_reaction_message_idx").on(t.messageId),
  ],
);

export const attachment = pgTable(
  "attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uploaderId: userRef("uploader_id").notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    messageId: text("message_id"),
    blobName: text("blob_name").notNull().unique(),
    originalName: text("original_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("attachment_conversation_idx").on(t.conversationId)],
);

export const messageReport = pgTable(
  "message_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: text("message_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    messageSenderId: text("message_sender_id").notNull(),
    reporterId: userRef("reporter_id").notNull(),
    reason: text("reason", {
      enum: ["spam", "harassment", "inappropriate", "other"],
    }).notNull(),
    details: text("details"),
    // Evidence survives later edits/deletes of the message.
    bodySnapshot: text("body_snapshot").notNull(),
    attachmentIds: jsonb("attachment_ids").$type<string[]>().notNull(),
    status: text("status", { enum: ["open", "resolved", "dismissed"] })
      .notNull()
      .default("open"),
    resolution: text("resolution", {
      enum: ["dismissed", "message_deleted", "user_banned"],
    }),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("message_report_once_idx").on(t.messageId, t.reporterId),
    index("message_report_status_idx").on(t.status, t.createdAt),
  ],
);

/** Messages per day, so admin metrics never need a cross-partition Cosmos query. */
export const messageStatsDaily = pgTable("message_stats_daily", {
  day: date("day").primaryKey(),
  count: integer("count").notNull().default(0),
});

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: text("admin_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("admin_audit_created_idx").on(t.createdAt)],
);
