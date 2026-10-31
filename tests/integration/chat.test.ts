import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as memberRoute from "@/app/api/conversations/[id]/members/[userId]/route";
import * as membersRoute from "@/app/api/conversations/[id]/members/route";
import * as membershipRoute from "@/app/api/conversations/[id]/membership/route";
import * as messagesRoute from "@/app/api/conversations/[id]/messages/route";
import * as readRoute from "@/app/api/conversations/[id]/read/route";
import * as conversationRoute from "@/app/api/conversations/[id]/route";
import * as searchRoute from "@/app/api/conversations/[id]/search/route";
import * as typingRoute from "@/app/api/conversations/[id]/typing/route";
import * as directRoute from "@/app/api/conversations/direct/route";
import * as conversationsRoute from "@/app/api/conversations/route";
import * as unfriendRoute from "@/app/api/friends/[userId]/route";
import * as acceptRoute from "@/app/api/friends/requests/[id]/accept/route";
import * as requestRoute from "@/app/api/friends/requests/[id]/route";
import * as requestsRoute from "@/app/api/friends/requests/route";
import * as friendsRoute from "@/app/api/friends/route";
import * as codeRoute from "@/app/api/me/friend-code/route";
import * as reactionsRoute from "@/app/api/messages/[id]/reactions/route";
import * as messageRoute from "@/app/api/messages/[id]/route";
import * as negotiateRoute from "@/app/api/negotiate/route";
import { published } from "../setup/fakes";
import { call, makeUser, resetDb } from "./helpers";

vi.mock("@/lib/email", () => ({
  sendMail: vi.fn(),
  sendMailInBackground: vi.fn(),
}));

beforeEach(resetDb);

type User = Awaited<ReturnType<typeof makeUser>>;

async function codeOf(u: User): Promise<string> {
  const { json } = await call(codeRoute.GET, { cookie: u.cookie, params: {} });
  return json.code;
}

async function befriend(a: User, b: User) {
  await call(requestsRoute.POST, {
    method: "POST",
    cookie: a.cookie,
    body: { code: await codeOf(b) },
    params: {},
  });
  const { json } = await call(friendsRoute.GET, {
    cookie: b.cookie,
    params: {},
  });
  await call(acceptRoute.POST, {
    method: "POST",
    cookie: b.cookie,
    params: { id: json.incoming[0].requestId },
  });
}

async function dm(a: User, b: User): Promise<string> {
  const { json } = await call(directRoute.POST, {
    method: "POST",
    cookie: a.cookie,
    body: { userId: b.id },
    params: {},
  });
  return json.id;
}

async function send(u: User, conversationId: string, body: unknown) {
  return await call(messagesRoute.POST, {
    method: "POST",
    cookie: u.cookie,
    body,
    params: { id: conversationId },
  });
}

const text = (body: string) => ({ body, clientMessageId: randomUUID() });

async function history(u: User, conversationId: string, query = "") {
  return await call(messagesRoute.GET, {
    cookie: u.cookie,
    path: `/api/conversations/${conversationId}/messages${query}`,
    params: { id: conversationId },
  });
}

describe("access control", () => {
  it("rejects requests without a session", async () => {
    const res = await call(friendsRoute.GET, { params: {} });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects cross-origin writes", async () => {
    const ann = await makeUser("ann");
    const res = await call(requestsRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      origin: "https://evil.example",
      body: { code: "123456" },
      params: {},
    });
    expect(res.status).toBe(403);
  });

  it("negotiate binds the socket to the session user, not to input", async () => {
    const ann = await makeUser("ann");
    const res = await call(negotiateRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { userId: "someone-else" },
      params: {},
    });
    expect(res.json.url).toContain(`user=${ann.id}`);
    expect(res.res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("friend codes", () => {
  it("gives every user a stable 6-digit code", async () => {
    const ann = await makeUser("ann");
    const code = await codeOf(ann);
    expect(code).toMatch(/^\d{6}$/);
    await expect(codeOf(ann)).resolves.toBe(code);
  });

  it("sends, accepts and lists a friend request", async () => {
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    const sent = await call(requestsRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { code: await codeOf(bob) },
      params: {},
    });
    expect(sent.json).toMatchObject({
      status: "sent",
      user: { username: "bob" },
    });
    expect(published.at(-1)?.event.type).toBe("friend.request");

    const { json } = await call(friendsRoute.GET, {
      cookie: bob.cookie,
      params: {},
    });
    expect(json.incoming).toHaveLength(1);
    await call(acceptRoute.POST, {
      method: "POST",
      cookie: bob.cookie,
      params: { id: json.incoming[0].requestId },
    });
    const after = await call(friendsRoute.GET, {
      cookie: ann.cookie,
      params: {},
    });
    expect(
      after.json.friends.map((f: { username: string }) => f.username),
    ).toEqual(["bob"]);
  });

  it("accepts automatically when both entered each other's code", async () => {
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    await call(requestsRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { code: await codeOf(bob) },
      params: {},
    });
    const res = await call(requestsRoute.POST, {
      method: "POST",
      cookie: bob.cookie,
      body: { code: await codeOf(ann) },
      params: {},
    });
    expect(res.json.status).toBe("accepted");
  });

  it("rejects own, unknown and malformed codes", async () => {
    const ann = await makeUser("ann");
    const post = async (code: string) =>
      await call(requestsRoute.POST, {
        method: "POST",
        cookie: ann.cookie,
        body: { code },
        params: {},
      });
    const own = await post(await codeOf(ann));
    expect(own.json.error.code).toBe("SELF_REQUEST");
    const unknown = (await codeOf(ann)) === "000000" ? "000001" : "000000";
    const unknownCode = await post(unknown);
    expect(unknownCode.json.error.code).toBe("INVALID_CODE");
    const malformed = await post("12ab");
    expect(malformed.status).toBe(400);
  });

  it("rate-limits code guessing", async () => {
    const ann = await makeUser("ann");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await call(requestsRoute.POST, {
        method: "POST",
        cookie: ann.cookie,
        body: { code: String(900_000 + i) },
        params: {},
      });
      statuses.push(res.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it("declines and unfriends", async () => {
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    await befriend(ann, bob);
    const res = await call(unfriendRoute.DELETE, {
      method: "DELETE",
      cookie: ann.cookie,
      params: { userId: bob.id },
    });
    expect(res.status).toBe(200);
    const { json } = await call(friendsRoute.GET, {
      cookie: bob.cookie,
      params: {},
    });
    expect(json.friends).toHaveLength(0);

    await call(requestsRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { code: await codeOf(bob) },
      params: {},
    });
    const pending = await call(friendsRoute.GET, {
      cookie: bob.cookie,
      params: {},
    });
    const declined = await call(requestRoute.DELETE, {
      method: "DELETE",
      cookie: bob.cookie,
      params: { id: pending.json.incoming[0].requestId },
    });
    expect(declined.status).toBe(200);
  });
});

describe("conversations", () => {
  it("only friends can start a DM", async () => {
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    const res = await call(directRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { userId: bob.id },
      params: {},
    });
    expect(res.json.error.code).toBe("NOT_FRIENDS");
  });

  it("reuses one DM per pair", async () => {
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    await befriend(ann, bob);
    const fromAnn = await dm(ann, bob);
    await expect(dm(bob, ann)).resolves.toBe(fromAnn);
  });

  it("creates groups from friends only and lets the owner kick", async () => {
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    const cat = await makeUser("cat");
    await befriend(ann, bob);
    const rejected = await call(conversationsRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { name: "Team", memberIds: [bob.id, cat.id] },
      params: {},
    });
    expect(rejected.json.error.code).toBe("NOT_FRIENDS");

    await befriend(ann, cat);
    const created = await call(conversationsRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { name: "Team", memberIds: [bob.id, cat.id] },
      params: {},
    });
    const id = created.json.id;
    const notOwner = await call(memberRoute.DELETE, {
      method: "DELETE",
      cookie: bob.cookie,
      params: { id, userId: cat.id },
    });
    expect(notOwner.status).toBe(403);

    await call(memberRoute.DELETE, {
      method: "DELETE",
      cookie: ann.cookie,
      params: { id, userId: cat.id },
    });
    const catHistory = await history(cat, id);
    expect(catHistory.status).toBe(404);
    const catSend = await send(cat, id, text("still here?"));
    expect(catSend.status).toBe(404);
  });

  it("adds members, renames, and hands ownership over on leave", async () => {
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    const cat = await makeUser("cat");
    await befriend(ann, bob);
    await befriend(ann, cat);
    const { json } = await call(conversationsRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { name: "Team", memberIds: [bob.id] },
      params: {},
    });
    await call(membersRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: { userIds: [cat.id] },
      params: { id: json.id },
    });
    await call(conversationRoute.PATCH, {
      method: "PATCH",
      cookie: ann.cookie,
      body: { name: "Crew" },
      params: { id: json.id },
    });
    await call(memberRoute.DELETE, {
      method: "DELETE",
      cookie: ann.cookie,
      params: { id: json.id, userId: ann.id },
    });
    const details = await call(conversationRoute.GET, {
      cookie: bob.cookie,
      params: { id: json.id },
    });
    expect(details.json.title).toBe("Crew");
    expect(
      details.json.members.map((m: { username: string }) => m.username),
    ).toEqual(["bob", "cat"]);
    expect(details.json.role).toBe("owner");
  });
});

describe("messages", () => {
  async function pair() {
    const ann = await makeUser("ann");
    const bob = await makeUser("bob");
    await befriend(ann, bob);
    return { ann, bob, id: await dm(ann, bob) };
  }

  it("creates, reads, edits and deletes a message (CRUD)", async () => {
    const { ann, bob, id } = await pair();
    const created = await send(ann, id, text("Hello Bob"));
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({
      body: "Hello Bob",
      senderId: ann.id,
      senderName: "ann",
    });
    expect(created.json.createdAt).toBeTruthy();

    const read = await history(bob, id);
    expect(read.json.messages.map((m: { body: string }) => m.body)).toEqual([
      "Hello Bob",
    ]);

    const edited = await call(messageRoute.PATCH, {
      method: "PATCH",
      cookie: ann.cookie,
      body: { conversationId: id, body: "Hello Bob!" },
      params: { id: created.json.id },
    });
    expect(edited.json).toMatchObject({ body: "Hello Bob!" });
    expect(edited.json.editedAt).toBeTruthy();

    const notMine = await call(messageRoute.PATCH, {
      method: "PATCH",
      cookie: bob.cookie,
      body: { conversationId: id, body: "hijack" },
      params: { id: created.json.id },
    });
    expect(notMine.status).toBe(403);

    await call(messageRoute.DELETE, {
      method: "DELETE",
      cookie: ann.cookie,
      path: `/api/messages/${created.json.id}?conversationId=${id}`,
      params: { id: created.json.id },
    });
    const afterDelete = await history(bob, id);
    const [deleted] = afterDelete.json.messages;
    expect(deleted.deletedAt).toBeTruthy();
    expect(deleted.body).toBe("");
  });

  it("publishes only after the message is stored", async () => {
    const { ann, bob, id } = await pair();
    const res = await send(ann, id, text("hi"));
    const event = published.find((p) => p.event.type === "message.created");
    expect(event?.userIds.sort()).toEqual([ann.id, bob.id].sort());
    const bobHistory = await history(bob, id);
    expect(bobHistory.json.messages[0].id).toBe(res.json.id);
  });

  it("is idempotent for retried sends", async () => {
    const { ann, bob, id } = await pair();
    const payload = text("once");
    const first = await send(ann, id, payload);
    const retry = await send(ann, id, payload);
    expect(retry.json.id).toBe(first.json.id);
    const bobHistory = await history(bob, id);
    expect(bobHistory.json.messages).toHaveLength(1);
  });

  it("validates and sanitizes the body", async () => {
    const { ann, bob, id } = await pair();
    const blank = await send(ann, id, text("   "));
    expect(blank.json.error.code).toBe("EMPTY_MESSAGE");
    const tooLong = await send(ann, id, text("x".repeat(2001)));
    expect(tooLong.json.error.code).toBe("MESSAGE_TOO_LONG");
    const xss = await send(
      ann,
      id,
      text('<img src=x onerror="alert(1)">hi<script>alert(1)</script>'),
    );
    expect(xss.json.body).toBe("hi");
    const plain = await send(ann, id, text("a < b & 2 > 1 <3"));
    expect(plain.json.body).toBe("a < b & 2 > 1 <3");
    const bobHistory = await history(bob, id);
    expect(bobHistory.json.messages).toHaveLength(2);
  });

  it("rejects oversized request bodies", async () => {
    const { ann, id } = await pair();
    const res = await send(ann, id, { ...text("x"), body: "x".repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it("hides conversations from non-members", async () => {
    const { id } = await pair();
    const eve = await makeUser("eve");
    const eveHistory = await history(eve, id);
    expect(eveHistory.status).toBe(404);
    const eveSend = await send(eve, id, text("hi"));
    expect(eveSend.status).toBe(404);
  });

  it("stops DMs after unfriending but keeps history readable", async () => {
    const { ann, bob, id } = await pair();
    await send(ann, id, text("before"));
    await call(unfriendRoute.DELETE, {
      method: "DELETE",
      cookie: ann.cookie,
      params: { userId: bob.id },
    });
    const afterUnfriend = await send(bob, id, text("after"));
    expect(afterUnfriend.json.error.code).toBe("NOT_FRIENDS");
    const bobHistory = await history(bob, id);
    expect(bobHistory.json.messages).toHaveLength(1);
  });

  it("paginates newest-first with a cursor and supports jumping", async () => {
    const { ann, bob, id } = await pair();
    for (let i = 1; i <= 5; i++) {
      await send(ann, id, text(`m${i}`));
    }
    const first = await history(bob, id, "?limit=2");
    expect(first.json.messages.map((m: { body: string }) => m.body)).toEqual([
      "m4",
      "m5",
    ]);
    expect(first.json.hasMore).toBe(true);
    const cursor = first.json.messages[0].sortKey;
    const second = await history(
      bob,
      id,
      `?limit=2&before=${encodeURIComponent(cursor)}`,
    );
    expect(second.json.messages.map((m: { body: string }) => m.body)).toEqual([
      "m2",
      "m3",
    ]);

    const around = await history(
      bob,
      id,
      `?limit=2&around=${encodeURIComponent(second.json.messages[0].sortKey)}`,
    );
    expect(around.json.messages.map((m: { body: string }) => m.body)).toContain(
      "m2",
    );
  });

  it("replies within the conversation only and snapshots the original", async () => {
    const { ann, bob, id } = await pair();
    const original = await send(ann, id, text("question?"));
    const reply = await send(bob, id, {
      ...text("answer"),
      replyToId: original.json.id,
    });
    expect(reply.json.replyTo).toMatchObject({
      id: original.json.id,
      preview: "question?",
    });

    const cat = await makeUser("cat");
    await befriend(bob, cat);
    const other = await dm(bob, cat);
    const cross = await send(bob, other, {
      ...text("sneaky"),
      replyToId: original.json.id,
    });
    expect(cross.json.error.code).toBe("INVALID_REPLY");
  });

  it("computes mentions on the server", async () => {
    const { ann, bob, id } = await pair();
    const res = await send(ann, id, text("hey @bob and @nobody"));
    expect(res.json.mentions).toEqual([bob.id]);
  });

  it("counts unread messages once and resets on read", async () => {
    const { ann, bob, id } = await pair();
    await send(ann, id, text("1"));
    await send(ann, id, text("2"));
    const unreadFor = async (u: User) => {
      const res = await call(conversationsRoute.GET, {
        cookie: u.cookie,
        params: {},
      });
      return res.json[0].unread;
    };
    await expect(unreadFor(bob)).resolves.toBe(2);
    await call(readRoute.POST, {
      method: "POST",
      cookie: bob.cookie,
      params: { id },
    });
    await expect(unreadFor(bob)).resolves.toBe(0);
    expect(published.some((p) => p.event.type === "conversation.read")).toBe(
      true,
    );
    await expect(unreadFor(ann)).resolves.toBe(0);
  });

  it("toggles allowed reactions only", async () => {
    const { ann, bob, id } = await pair();
    const msg = await send(ann, id, text("nice"));
    const react = async (emoji: string) =>
      await call(reactionsRoute.POST, {
        method: "POST",
        cookie: bob.cookie,
        body: { conversationId: id, emoji },
        params: { id: msg.json.id },
      });
    const added = await react("👍");
    expect(added.json.reactions).toEqual([{ emoji: "👍", userIds: [bob.id] }]);
    const removed = await react("👍");
    expect(removed.json.reactions).toEqual([]);
    const notAllowed = await react("💩");
    expect(notAllowed.status).toBe(400);
  });

  it("searches a conversation with literal, case-insensitive matching", async () => {
    const { ann, bob, id } = await pair();
    await send(ann, id, text("Pizza tonight?"));
    await send(ann, id, text("100% sure ' OR 1=1 --"));
    const deleted = await send(ann, id, text("pizza secret"));
    await call(messageRoute.DELETE, {
      method: "DELETE",
      cookie: ann.cookie,
      path: `/api/messages/${deleted.json.id}?conversationId=${id}`,
      params: { id: deleted.json.id },
    });
    const search = async (q: string, who = bob) =>
      await call(searchRoute.GET, {
        cookie: who.cookie,
        path: `/api/conversations/${id}/search?q=${encodeURIComponent(q)}`,
        params: { id },
      });
    const upper = await search("PIZZA");
    expect(upper.json.results.map((m: { body: string }) => m.body)).toEqual([
      "Pizza tonight?",
    ]);
    const literal = await search("' OR 1=1");
    expect(literal.json.results).toHaveLength(1);
    const tooShort = await search("a");
    expect(tooShort.status).toBe(400);
    const eve = await makeUser("eve");
    const outsider = await search("pizza", eve);
    expect(outsider.status).toBe(404);
  });

  it("mutes and unmutes a conversation", async () => {
    const { bob, id } = await pair();
    const mute = async (mutedFor: unknown) =>
      await call(membershipRoute.PATCH, {
        method: "PATCH",
        cookie: bob.cookie,
        body: { mutedFor },
        params: { id },
      });
    const muted = await mute(8);
    expect(muted.json.mutedUntil).toBeTruthy();
    const list = await call(conversationsRoute.GET, {
      cookie: bob.cookie,
      params: {},
    });
    expect(list.json[0].muted).toBe(true);
    const unmuted = await mute(null);
    expect(unmuted.json.mutedUntil).toBeNull();
    const invalid = await mute(5);
    expect(invalid.status).toBe(400);
  });

  it("publishes typing at most once per window", async () => {
    const { ann, id } = await pair();
    for (let i = 0; i < 3; i++) {
      await call(typingRoute.POST, {
        method: "POST",
        cookie: ann.cookie,
        params: { id },
      });
    }
    expect(published.filter((p) => p.event.type === "typing")).toHaveLength(1);
  });

  it("rate-limits message spam", async () => {
    const { ann, id } = await pair();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await send(ann, id, text(`spam ${i}`));
      statuses.push(res.status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
