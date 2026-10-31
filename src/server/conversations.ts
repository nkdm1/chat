import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, conversationMember, user } from "@/db/schema";
import { GROUP_MAX_MEMBERS } from "@/lib/validation";
import { areFriends, friendIds } from "@/server/friends";
import { ApiError, badRequest, forbidden, notFound } from "@/server/http";
import { realtime } from "@/server/realtime";
import { sanitizeLine } from "@/server/sanitize";
import { clearUnread, mentionFlags, unreadCounts } from "@/server/unread";

export type Membership = {
  conversation: typeof conversation.$inferSelect;
  member: typeof conversationMember.$inferSelect;
};

/**
 * The authorization check for everything inside a conversation. Non-members
 * get 404 (not 403), so conversation ids can't be probed.
 */
export async function requireMember(
  userId: string,
  conversationId: string,
): Promise<Membership> {
  const [row] = await db
    .select({ conversation, member: conversationMember })
    .from(conversationMember)
    .innerJoin(
      conversation,
      eq(conversation.id, conversationMember.conversationId),
    )
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        eq(conversationMember.userId, userId),
      ),
    );
  if (!row) {
    throw notFound("Conversation not found");
  }
  return row;
}

export async function memberIds(conversationId: string) {
  const rows = await db
    .select({ userId: conversationMember.userId })
    .from(conversationMember)
    .where(eq(conversationMember.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

export async function membersWithNames(conversationId: string) {
  return await db
    .select({
      userId: conversationMember.userId,
      username: user.username,
      role: conversationMember.role,
      lastReadAt: conversationMember.lastReadAt,
      joinedAt: conversationMember.joinedAt,
    })
    .from(conversationMember)
    .innerJoin(user, eq(user.id, conversationMember.userId))
    .where(eq(conversationMember.conversationId, conversationId))
    .orderBy(asc(conversationMember.joinedAt));
}

function isMuted(mutedUntil: Date | null) {
  return !!mutedUntil && mutedUntil > new Date();
}

async function directPeers(userId: string, conversationIds: string[]) {
  const peers = await db
    .select({
      conversationId: conversationMember.conversationId,
      userId: user.id,
      username: user.username,
    })
    .from(conversationMember)
    .innerJoin(user, eq(user.id, conversationMember.userId))
    .innerJoin(
      conversation,
      eq(conversation.id, conversationMember.conversationId),
    )
    .where(
      and(
        inArray(conversationMember.conversationId, conversationIds),
        eq(conversation.type, "direct"),
        sql`${conversationMember.userId} <> ${userId}`,
      ),
    );
  return new Map(peers.map((p) => [p.conversationId, p]));
}

export async function listConversations(userId: string) {
  const mine = await db
    .select({ conversation, member: conversationMember })
    .from(conversationMember)
    .innerJoin(
      conversation,
      eq(conversation.id, conversationMember.conversationId),
    )
    .where(eq(conversationMember.userId, userId))
    .orderBy(
      sql`${conversation.lastMessageAt} desc nulls last`,
      desc(conversation.createdAt),
    );
  if (mine.length === 0) {
    return [];
  }

  const dmPeer = await directPeers(
    userId,
    mine.map((m) => m.conversation.id),
  );

  const [unread, mentions] = await Promise.all([
    unreadCounts(
      userId,
      mine.map((m) => ({
        id: m.conversation.id,
        lastReadAt: m.member.lastReadAt,
        joinedAt: m.member.joinedAt,
      })),
    ),
    mentionFlags(userId),
  ]);

  return mine.map(({ conversation: c, member: m }) => {
    const peer = dmPeer.get(c.id);
    return {
      id: c.id,
      type: c.type,
      title:
        c.type === "direct"
          ? (peer?.username ?? "unknown")
          : (c.name ?? "Group"),
      peerId: peer?.userId ?? null,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      lastMessageSenderId: c.lastMessageSenderId,
      unread: unread[c.id] ?? 0,
      mentioned: mentions.has(c.id),
      muted: isMuted(m.mutedUntil),
      mutedUntil: m.mutedUntil,
      role: m.role,
    };
  });
}

export async function getConversation(userId: string, conversationId: string) {
  const { conversation: c, member } = await requireMember(
    userId,
    conversationId,
  );
  const members = await membersWithNames(conversationId);
  const peer =
    c.type === "direct" ? members.find((m) => m.userId !== userId) : undefined;
  return {
    id: c.id,
    type: c.type,
    title:
      c.type === "direct" ? (peer?.username ?? "unknown") : (c.name ?? "Group"),
    peerId: peer?.userId ?? null,
    // A DM is read-only once the two users are no longer friends.
    canSend:
      c.type === "group" || (!!peer && (await areFriends(userId, peer.userId))),
    role: member.role,
    muted: isMuted(member.mutedUntil),
    mutedUntil: member.mutedUntil,
    members,
  };
}

export async function getOrCreateDirect(userId: string, otherId: string) {
  if (userId === otherId) {
    throw badRequest("Can't message yourself");
  }
  if (!(await areFriends(userId, otherId))) {
    throw new ApiError(403, "NOT_FRIENDS", "You can only message friends");
  }
  const directKey = [userId, otherId].sort().join(":");
  return await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conversation)
      .values({ type: "direct", directKey, createdBy: userId })
      .onConflictDoNothing({ target: conversation.directKey })
      .returning();
    if (created) {
      await tx.insert(conversationMember).values([
        { conversationId: created.id, userId, role: "member" },
        { conversationId: created.id, userId: otherId, role: "member" },
      ]);
      return { id: created.id, created: true };
    }
    const existing = await tx.query.conversation.findFirst({
      where: eq(conversation.directKey, directKey),
    });
    if (!existing) {
      throw new ApiError(409, "CONFLICT", "Try again");
    }
    return { id: existing.id, created: false };
  });
}

/** Group members must be the creator's (or owner's) accepted friends. */
async function requireFriends(userId: string, ids: string[]) {
  const friends = new Set(await friendIds(userId));
  const notFriends = ids.filter((id) => !friends.has(id));
  if (notFriends.length) {
    throw new ApiError(403, "NOT_FRIENDS", "You can only add your friends");
  }
}

export async function createGroup(
  userId: string,
  rawName: string,
  rawMemberIds: string[],
) {
  const name = sanitizeLine(rawName);
  if (!name) {
    throw badRequest("Name the group");
  }
  const memberIdList = [...new Set(rawMemberIds)].filter((id) => id !== userId);
  if (memberIdList.length === 0) {
    throw badRequest("Add at least one friend");
  }
  await requireFriends(userId, memberIdList);

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conversation)
      .values({ type: "group", name, createdBy: userId })
      .returning();
    await tx.insert(conversationMember).values([
      { conversationId: created.id, userId, role: "owner" },
      ...memberIdList.map((m) => ({
        conversationId: created.id,
        userId: m,
        role: "member" as const,
      })),
    ]);
    return created.id;
  });
  await realtime().toUsers([userId, ...memberIdList], {
    type: "conversation.updated",
    conversationId: id,
  });
  return { id };
}

async function requireOwnerOfGroup(userId: string, conversationId: string) {
  const m = await requireMember(userId, conversationId);
  if (m.conversation.type !== "group") {
    throw badRequest("Not a group");
  }
  if (m.member.role !== "owner") {
    throw forbidden("Only the group owner can do that");
  }
  return m;
}

export async function renameGroup(
  userId: string,
  conversationId: string,
  rawName: string,
) {
  await requireOwnerOfGroup(userId, conversationId);
  const name = sanitizeLine(rawName);
  if (!name) {
    throw badRequest("Name the group");
  }
  await db
    .update(conversation)
    .set({ name })
    .where(eq(conversation.id, conversationId));
  await realtime().toUsers(await memberIds(conversationId), {
    type: "conversation.updated",
    conversationId,
  });
}

export async function addMembers(
  userId: string,
  conversationId: string,
  ids: string[],
) {
  await requireOwnerOfGroup(userId, conversationId);
  const current = new Set(await memberIds(conversationId));
  const toAdd = [...new Set(ids)].filter((id) => !current.has(id));
  if (toAdd.length === 0) {
    return;
  }
  if (current.size + toAdd.length > GROUP_MAX_MEMBERS) {
    throw badRequest(
      `Groups are limited to ${GROUP_MAX_MEMBERS} members`,
      "GROUP_FULL",
    );
  }
  await requireFriends(userId, toAdd);
  await db
    .insert(conversationMember)
    .values(
      toAdd.map((m) => ({
        conversationId,
        userId: m,
        role: "member" as const,
      })),
    )
    .onConflictDoNothing();
  await realtime().toUsers([...current, ...toAdd], {
    type: "conversation.member.added",
    conversationId,
    userIds: toAdd,
  });
}

/** Owner kicks someone, or anyone leaves (targetId === userId). */
export async function removeMember(
  userId: string,
  conversationId: string,
  targetId: string,
) {
  const { conversation: c, member } = await requireMember(
    userId,
    conversationId,
  );
  if (c.type !== "group") {
    throw badRequest("You can't leave a direct conversation");
  }
  const leaving = targetId === userId;
  if (!leaving && member.role !== "owner") {
    throw forbidden("Only the group owner can remove members");
  }
  const before = await memberIds(conversationId);
  if (!before.includes(targetId)) {
    throw notFound("Not a member");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(conversationMember)
      .where(
        and(
          eq(conversationMember.conversationId, conversationId),
          eq(conversationMember.userId, targetId),
        ),
      );
    if (leaving && member.role === "owner") {
      // Hand the group to the longest-standing member, or drop an empty group.
      const [next] = await tx
        .select({ userId: conversationMember.userId })
        .from(conversationMember)
        .where(eq(conversationMember.conversationId, conversationId))
        .orderBy(asc(conversationMember.joinedAt))
        .limit(1);
      await (next
        ? tx
            .update(conversationMember)
            .set({ role: "owner" })
            .where(
              and(
                eq(conversationMember.conversationId, conversationId),
                eq(conversationMember.userId, next.userId),
              ),
            )
        : tx.delete(conversation).where(eq(conversation.id, conversationId)));
    }
  });
  await clearUnread(targetId, conversationId);
  await realtime().toUsers(before, {
    type: "conversation.member.removed",
    conversationId,
    userId: targetId,
  });
}

export async function markRead(userId: string, conversationId: string) {
  await requireMember(userId, conversationId);
  const now = new Date();
  // Never move the read position backwards.
  await db
    .update(conversationMember)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        eq(conversationMember.userId, userId),
        or(
          isNull(conversationMember.lastReadAt),
          lt(conversationMember.lastReadAt, now),
        ),
      ),
    );
  await clearUnread(userId, conversationId);
  await realtime().toUsers(await memberIds(conversationId), {
    type: "conversation.read",
    conversationId,
    userId,
    lastReadAt: now.toISOString(),
  });
}

const MUTED_FOREVER = new Date("9999-12-31T00:00:00Z");

function muteDeadline(mutedFor: null | "forever" | number) {
  if (mutedFor === null) {
    return null;
  }
  if (mutedFor === "forever") {
    return MUTED_FOREVER;
  }
  return new Date(Date.now() + mutedFor * 60 * 60 * 1000);
}

export async function setMute(
  userId: string,
  conversationId: string,
  mutedFor: null | "forever" | number,
) {
  await requireMember(userId, conversationId);
  const mutedUntil = muteDeadline(mutedFor);
  await db
    .update(conversationMember)
    .set({ mutedUntil })
    .where(
      and(
        eq(conversationMember.conversationId, conversationId),
        eq(conversationMember.userId, userId),
      ),
    );
  return { mutedUntil };
}
