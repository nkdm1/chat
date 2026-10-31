import { randomInt } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { friendCode, friendship, user } from "@/db/schema";
import { ApiError, forbidden, notFound } from "@/server/http";
import { onlineSet } from "@/server/presence";
import { realtime } from "@/server/realtime";

const MAX_PENDING_OUTGOING = 20;

function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Postgres error code, also when wrapped by Drizzle (in `cause`). */
function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "cause" in error ? pgErrorCode(error.cause) : undefined;
}

const UNIQUE_VIOLATION = "23505";

async function writeCode(userId: string, replace: boolean): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = newCode();
    try {
      const insert = db.insert(friendCode).values({ userId, code });
      const [row] = replace
        ? await insert
            .onConflictDoUpdate({
              target: friendCode.userId,
              set: { code, createdAt: new Date() },
            })
            .returning()
        : await insert
            .onConflictDoNothing({ target: friendCode.userId })
            .returning();
      if (row) {
        return row.code;
      }
      const existing = await db.query.friendCode.findFirst({
        where: eq(friendCode.userId, userId),
      });
      if (existing) {
        return existing.code;
      }
    } catch (error) {
      // Unique violation: the code is taken by someone else, so retry.
      if (pgErrorCode(error) !== UNIQUE_VIOLATION) {
        throw error;
      }
    }
  }
  throw new ApiError(
    503,
    "CODE_UNAVAILABLE",
    "Could not generate a code. Try again.",
  );
}

export async function getFriendCode(userId: string) {
  const existing = await db.query.friendCode.findFirst({
    where: eq(friendCode.userId, userId),
  });
  return await (existing?.code ?? writeCode(userId, false));
}

export async function regenerateFriendCode(userId: string) {
  return await writeCode(userId, true);
}

const pairWhere = (a: string, b: string) =>
  or(
    and(eq(friendship.requesterId, a), eq(friendship.addresseeId, b)),
    and(eq(friendship.requesterId, b), eq(friendship.addresseeId, a)),
  );

export async function areFriends(a: string, b: string) {
  const row = await db.query.friendship.findFirst({
    where: and(pairWhere(a, b), eq(friendship.status, "accepted")),
    columns: { id: true },
  });
  return !!row;
}

/** Ids of all accepted friends of a user. */
export async function friendIds(userId: string) {
  const rows = await db
    .select({
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
    })
    .from(friendship)
    .where(
      and(
        eq(friendship.status, "accepted"),
        or(
          eq(friendship.requesterId, userId),
          eq(friendship.addresseeId, userId),
        ),
      ),
    );
  return rows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId,
  );
}

export async function listFriends(userId: string) {
  const rows = await db
    .select({
      id: friendship.id,
      status: friendship.status,
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
      createdAt: friendship.createdAt,
      respondedAt: friendship.respondedAt,
    })
    .from(friendship)
    .where(
      or(
        eq(friendship.requesterId, userId),
        eq(friendship.addresseeId, userId),
      ),
    );

  const otherIds = rows.map((r) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId,
  );
  const users = otherIds.length
    ? await db
        .select({ id: user.id, username: user.username })
        .from(user)
        .where(inArray(user.id, otherIds))
    : [];
  const names = new Map(users.map((u) => [u.id, u.username]));
  const online = await onlineSet(
    rows
      .filter((r) => r.status === "accepted")
      .map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)),
  );

  const view = (r: (typeof rows)[number]) => {
    const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId;
    return {
      requestId: r.id,
      userId: otherId,
      username: names.get(otherId) ?? "unknown",
    };
  };

  return {
    friends: rows
      .filter((r) => r.status === "accepted")
      .map((r) => ({
        ...view(r),
        since: r.respondedAt ?? r.createdAt,
        online: online.has(view(r).userId),
      }))
      .sort((a, b) => a.username.localeCompare(b.username)),
    incoming: rows
      .filter((r) => r.status === "pending" && r.addresseeId === userId)
      .map((r) => ({ ...view(r), createdAt: r.createdAt })),
    outgoing: rows
      .filter((r) => r.status === "pending" && r.requesterId === userId)
      .map((r) => ({ ...view(r), createdAt: r.createdAt })),
  };
}

async function requirePendingBudget(userId: string) {
  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(friendship)
    .where(
      and(eq(friendship.requesterId, userId), eq(friendship.status, "pending")),
    );
  if (pending >= MAX_PENDING_OUTGOING) {
    throw new ApiError(
      429,
      "TOO_MANY_PENDING",
      "Too many pending requests. Wait for answers first.",
    );
  }
}

export async function sendFriendRequest(
  me: { id: string; username: string },
  code: string,
) {
  const target = await db
    .select({ id: user.id, username: user.username })
    .from(friendCode)
    .innerJoin(user, eq(user.id, friendCode.userId))
    .where(eq(friendCode.code, code))
    .then((r) => r[0]);
  if (!target) {
    throw new ApiError(404, "INVALID_CODE", "No one has that code");
  }
  if (target.id === me.id) {
    throw new ApiError(400, "SELF_REQUEST", "That's your own code");
  }

  const existing = await db.query.friendship.findFirst({
    where: pairWhere(me.id, target.id),
  });
  if (existing?.status === "accepted") {
    throw new ApiError(
      409,
      "ALREADY_FRIENDS",
      `You and ${target.username} are already friends`,
    );
  }
  if (existing && existing.requesterId === me.id) {
    throw new ApiError(409, "ALREADY_REQUESTED", "Request already sent");
  }
  if (existing) {
    // They already invited me: entering their code accepts.
    await acceptFriendRequest(me.id, existing.id);
    return { status: "accepted" as const, user: target };
  }

  await requirePendingBudget(me.id);
  const [row] = await db
    .insert(friendship)
    .values({ requesterId: me.id, addresseeId: target.id, status: "pending" })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    throw new ApiError(409, "ALREADY_REQUESTED", "Request already sent");
  }

  await realtime().toUsers([target.id], {
    type: "friend.request",
    requestId: row.id,
    from: { userId: me.id, username: me.username },
  });
  return { status: "sent" as const, user: target };
}

export async function acceptFriendRequest(userId: string, requestId: string) {
  const [row] = await db
    .update(friendship)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(
      and(
        eq(friendship.id, requestId),
        eq(friendship.addresseeId, userId),
        eq(friendship.status, "pending"),
      ),
    )
    .returning();
  if (!row) {
    throw notFound("Request not found");
  }
  await realtime().toUsers([row.requesterId, row.addresseeId], {
    type: "friend.accepted",
    requestId: row.id,
  });
}

/** Decline (addressee) or cancel (requester) a pending request. */
export async function deleteFriendRequest(userId: string, requestId: string) {
  const [row] = await db
    .delete(friendship)
    .where(
      and(
        eq(friendship.id, requestId),
        eq(friendship.status, "pending"),
        or(
          eq(friendship.requesterId, userId),
          eq(friendship.addresseeId, userId),
        ),
      ),
    )
    .returning();
  if (!row) {
    throw notFound("Request not found");
  }
  await realtime().toUsers([row.requesterId, row.addresseeId], {
    type: "friend.removed",
    requestId: row.id,
  });
}

export async function unfriend(userId: string, friendId: string) {
  if (userId === friendId) {
    throw forbidden();
  }
  const [row] = await db
    .delete(friendship)
    .where(and(pairWhere(userId, friendId), eq(friendship.status, "accepted")))
    .returning();
  if (!row) {
    throw notFound("Not friends");
  }
  await realtime().toUsers([userId, friendId], {
    type: "friend.removed",
    requestId: row.id,
  });
}
