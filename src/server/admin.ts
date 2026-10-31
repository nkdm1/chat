import { aliasedTable, and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLog,
  conversation,
  messageReport,
  messageStatsDaily,
  session,
  user,
} from "@/db/schema";
import { storageUsedBytes } from "@/server/attachments";
import type { SessionUser } from "@/server/http";
import { ApiError, badRequest, notFound } from "@/server/http";
import { deleteMessage } from "@/server/messages/service";
import { onlineCount } from "@/server/presence";
import { realtime } from "@/server/realtime";

const DAY = 24 * 60 * 60 * 1000;

type AuditEntry = typeof adminAuditLog.$inferInsert;

async function audit(entry: AuditEntry) {
  await db.insert(adminAuditLog).values(entry);
}

const REPORT_OUTCOME = {
  dismiss: { status: "dismissed", resolution: "dismissed" },
  "delete-message": { status: "resolved", resolution: "message_deleted" },
  ban: { status: "resolved", resolution: "user_banned" },
} as const;

const count = sql<number>`count(*)::int`;

export async function metrics() {
  const since7 = new Date(Date.now() - 7 * DAY);
  const since14 = new Date(Date.now() - 13 * DAY).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [users, daily, openReports, activeConversations, online, storage] =
    await Promise.all([
      db
        .select({
          total: count,
          verified: sql<number>`count(*) filter (where ${user.emailVerified})::int`,
          new7d: sql<number>`count(*) filter (where ${user.createdAt} >= ${since7.toISOString()})::int`,
          banned: sql<number>`count(*) filter (where ${user.banned})::int`,
        })
        .from(user)
        .then((r) => r[0]),
      db
        .select({ day: messageStatsDaily.day, count: messageStatsDaily.count })
        .from(messageStatsDaily)
        .where(gte(messageStatsDaily.day, since14)),
      db
        .select({ n: count })
        .from(messageReport)
        .where(eq(messageReport.status, "open"))
        .then((r) => r[0].n),
      db
        .select({ n: count })
        .from(conversation)
        .where(gte(conversation.lastMessageAt, since7))
        .then((r) => r[0].n),
      onlineCount(),
      storageUsedBytes(),
    ]);

  // 14 consecutive days, zero-filled.
  const byDay = new Map(daily.map((d) => [d.day, d.count]));
  const messagesPerDay = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * DAY)
      .toISOString()
      .slice(0, 10);
    return { day, count: byDay.get(day) ?? 0 };
  });

  return {
    users,
    online,
    messagesToday: byDay.get(today) ?? 0,
    activeConversations,
    openReports,
    storageBytes: storage,
    messagesPerDay,
  };
}

const reporter = aliasedTable(user, "reporter");
const author = aliasedTable(user, "author");

export async function listReports(status: "open" | "resolved" | "dismissed") {
  return await db
    .select({
      id: messageReport.id,
      messageId: messageReport.messageId,
      conversationId: messageReport.conversationId,
      reason: messageReport.reason,
      details: messageReport.details,
      body: messageReport.bodySnapshot,
      attachmentIds: messageReport.attachmentIds,
      status: messageReport.status,
      resolution: messageReport.resolution,
      createdAt: messageReport.createdAt,
      resolvedAt: messageReport.resolvedAt,
      reporter: { id: reporter.id, username: reporter.username },
      author: {
        id: author.id,
        username: author.username,
        banned: author.banned,
      },
    })
    .from(messageReport)
    .innerJoin(reporter, eq(reporter.id, messageReport.reporterId))
    .innerJoin(author, eq(author.id, messageReport.messageSenderId))
    .where(eq(messageReport.status, status))
    .orderBy(desc(messageReport.createdAt))
    .limit(100);
}

export async function banUser(
  admin: SessionUser,
  userId: string,
  days: number | null,
  reason: string | undefined,
) {
  if (userId === admin.id) {
    throw badRequest("You can't ban yourself", "SELF_ACTION");
  }
  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) {
    throw notFound("User not found");
  }
  if (target.role === "admin") {
    throw badRequest("Revoke admin first", "TARGET_IS_ADMIN");
  }
  const banExpires = days ? new Date(Date.now() + days * DAY) : null;
  await db
    .update(user)
    .set({ banned: true, banReason: reason ?? null, banExpires })
    .where(eq(user.id, userId));
  // Revoke every session and drop live sockets: the ban takes effect now.
  await db.delete(session).where(eq(session.userId, userId));
  await realtime().disconnectUser(userId);
  await audit({
    adminId: admin.id,
    action: "user.ban",
    targetType: "user",
    targetId: userId,
    metadata: { days, reason },
  });
}

export async function actOnReport(
  admin: SessionUser,
  reportId: string,
  input: {
    action: "dismiss" | "delete-message" | "ban";
    banDays?: number | null;
    note?: string;
  },
) {
  const report = await db.query.messageReport.findFirst({
    where: eq(messageReport.id, reportId),
  });
  if (!report) {
    throw notFound("Report not found");
  }
  if (report.status !== "open") {
    throw new ApiError(409, "ALREADY_RESOLVED", "Report already handled");
  }

  if (input.action !== "dismiss") {
    await deleteMessage(admin, report.conversationId, report.messageId).catch(
      (error: unknown) => {
        const alreadyGone = error instanceof ApiError && error.status === 404;
        if (!alreadyGone) {
          throw error;
        }
      },
    );
  }
  if (input.action === "ban") {
    await banUser(
      admin,
      report.messageSenderId,
      input.banDays ?? null,
      input.note,
    );
  }

  // One decision closes every open report about the same message.
  await db
    .update(messageReport)
    .set({
      ...REPORT_OUTCOME[input.action],
      resolvedBy: admin.id,
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(messageReport.messageId, report.messageId),
        eq(messageReport.status, "open"),
      ),
    );
  await audit({
    adminId: admin.id,
    action: `report.${input.action}`,
    targetType: "report",
    targetId: reportId,
    metadata: { messageId: report.messageId, note: input.note },
  });
}

export async function listUsers(q: string | undefined) {
  const term = q?.trim();
  return await db
    .select({
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(
      term
        ? or(ilike(user.username, `%${term}%`), ilike(user.email, `%${term}%`))
        : undefined,
    )
    .orderBy(desc(user.createdAt))
    .limit(100);
}

export async function actOnUser(
  admin: SessionUser,
  userId: string,
  input: {
    action: "ban" | "unban" | "make-admin" | "revoke-admin";
    banDays?: number | null;
    reason?: string;
  },
) {
  if (userId === admin.id) {
    throw badRequest("You can't change your own account", "SELF_ACTION");
  }
  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) {
    throw notFound("User not found");
  }
  if (input.action === "ban") {
    await banUser(admin, userId, input.banDays ?? null, input.reason);
    return;
  }
  const changes =
    input.action === "unban"
      ? { banned: false, banReason: null, banExpires: null }
      : { role: input.action === "make-admin" ? "admin" : "user" };
  await db.update(user).set(changes).where(eq(user.id, userId));
  await audit({
    adminId: admin.id,
    action: `user.${input.action}`,
    targetType: "user",
    targetId: userId,
  });
}

export async function listAudit() {
  const actor = aliasedTable(user, "actor");
  return await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      metadata: adminAuditLog.metadata,
      createdAt: adminAuditLog.createdAt,
      admin: actor.username,
    })
    .from(adminAuditLog)
    .leftJoin(actor, eq(actor.id, adminAuditLog.adminId))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(200);
}
