import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auditRoute from "@/app/api/admin/audit/route";
import * as metricsRoute from "@/app/api/admin/metrics/route";
import * as reportActionRoute from "@/app/api/admin/reports/[id]/route";
import * as reportsRoute from "@/app/api/admin/reports/route";
import * as userActionRoute from "@/app/api/admin/users/[id]/route";
import * as attachmentRoute from "@/app/api/attachments/[id]/route";
import * as uploadRoute from "@/app/api/conversations/[id]/attachments/route";
import * as messagesRoute from "@/app/api/conversations/[id]/messages/route";
import * as directRoute from "@/app/api/conversations/direct/route";
import * as acceptRoute from "@/app/api/friends/requests/[id]/accept/route";
import * as requestsRoute from "@/app/api/friends/requests/route";
import * as friendsRoute from "@/app/api/friends/route";
import * as codeRoute from "@/app/api/me/friend-code/route";
import * as reportRoute from "@/app/api/messages/[id]/report/route";
import { db } from "@/db";
import { session, user } from "@/db/schema";
import { disconnected } from "../setup/fakes";
import { call, getSession, makeUser, resetDb } from "./helpers";

vi.mock("@/lib/email", () => ({
  sendMail: vi.fn(),
  sendMailInBackground: vi.fn(),
}));

beforeEach(resetDb);

type User = Awaited<ReturnType<typeof makeUser>>;

async function chat() {
  const ann = await makeUser("ann");
  const bob = await makeUser("bob");
  const bobCode = await call(codeRoute.GET, { cookie: bob.cookie, params: {} });
  const code: string = bobCode.json.code;
  await call(requestsRoute.POST, {
    method: "POST",
    cookie: ann.cookie,
    body: { code },
    params: {},
  });
  const pending = await call(friendsRoute.GET, {
    cookie: bob.cookie,
    params: {},
  });
  await call(acceptRoute.POST, {
    method: "POST",
    cookie: bob.cookie,
    params: { id: pending.json.incoming[0].requestId },
  });
  const { json } = await call(directRoute.POST, {
    method: "POST",
    cookie: ann.cookie,
    body: { userId: bob.id },
    params: {},
  });
  return { ann, bob, id: json.id };
}

async function upload(u: User, conversationId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return await call(uploadRoute.POST, {
    method: "POST",
    cookie: u.cookie,
    form,
    params: { id: conversationId },
  });
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

async function makeAdmin(name: string) {
  const admin = await makeUser(name);
  await db.update(user).set({ role: "admin" }).where(eq(user.id, admin.id));
  return admin;
}

describe("attachments", () => {
  it("accepts a real image and serves it only to members", async () => {
    const { ann, bob, id } = await chat();
    const res = await upload(ann, id, new File([PNG], "pic.png"));
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ name: "pic.png", mime: "image/png" });

    const sent = await call(messagesRoute.POST, {
      method: "POST",
      cookie: ann.cookie,
      body: {
        body: "",
        clientMessageId: randomUUID(),
        attachmentIds: [res.json.id],
      },
      params: { id },
    });
    expect(sent.json.attachments).toHaveLength(1);

    const download = await call(attachmentRoute.GET, {
      cookie: bob.cookie,
      params: { id: res.json.id },
    });
    expect(download.status).toBe(200);
    expect(download.res.headers.get("content-type")).toBe("image/png");
    expect(download.res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(download.res.headers.get("content-security-policy")).toContain(
      "sandbox",
    );
    expect(new Uint8Array(await download.res.arrayBuffer())).toEqual(PNG);

    const eve = await makeUser("eve");
    const forEve = await call(attachmentRoute.GET, {
      cookie: eve.cookie,
      params: { id: res.json.id },
    });
    expect(forEve.status).toBe(404);
  });

  it("rejects disallowed extensions, spoofed content and oversized files", async () => {
    const { ann, id } = await chat();
    const svg = await upload(
      ann,
      id,
      new File(['<svg onload="alert(1)"/>'], "x.svg"),
    );
    expect(svg.json.error.code).toBe("FILE_TYPE_NOT_ALLOWED");
    const exe = await upload(
      ann,
      id,
      new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])], "evil.png"),
    );
    expect(exe.json.error.code).toBe("FILE_TYPE_MISMATCH");
    const binaryTxt = await upload(ann, id, new File([PNG], "notes.txt"));
    expect(binaryTxt.json.error.code).toBe("FILE_TYPE_MISMATCH");
    const big = await upload(
      ann,
      id,
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf"),
    );
    expect(big.status).toBe(413);
    const plainText = await upload(ann, id, new File(["hello"], "notes.txt"));
    expect(plainText.status).toBe(201);
  });

  it("does not let someone send another user's upload", async () => {
    const { ann, bob, id } = await chat();
    const res = await upload(ann, id, new File([PNG], "pic.png"));
    const stolen = await call(messagesRoute.POST, {
      method: "POST",
      cookie: bob.cookie,
      body: {
        body: "mine now",
        clientMessageId: randomUUID(),
        attachmentIds: [res.json.id],
      },
      params: { id },
    });
    expect(stolen.json.error.code).toBe("INVALID_ATTACHMENT");
  });
});

describe("reports and admin", () => {
  async function reported() {
    const ctx = await chat();
    const msg = await call(messagesRoute.POST, {
      method: "POST",
      cookie: ctx.ann.cookie,
      body: { body: "rude words", clientMessageId: randomUUID() },
      params: { id: ctx.id },
    });
    const report = async (who: User) =>
      await call(reportRoute.POST, {
        method: "POST",
        cookie: who.cookie,
        body: {
          conversationId: ctx.id,
          reason: "harassment",
          details: "<b>mean</b>",
        },
        params: { id: msg.json.id },
      });
    return { ...ctx, messageId: msg.json.id, report };
  }

  it("accepts one report per user and never one's own message", async () => {
    const { ann, bob, report } = await reported();
    const first = await report(bob);
    expect(first.status).toBe(201);
    const duplicate = await report(bob);
    expect(duplicate.json.error.code).toBe("ALREADY_REPORTED");
    const ownMessage = await report(ann);
    expect(ownMessage.status).toBe(400);
  });

  it("keeps the admin API for admins only", async () => {
    const { bob } = await reported();
    const queue = await call(reportsRoute.GET, {
      cookie: bob.cookie,
      params: {},
    });
    expect(queue.status).toBe(403);
    const metrics = await call(metricsRoute.GET, {
      cookie: bob.cookie,
      params: {},
    });
    expect(metrics.status).toBe(403);
  });

  it("deletes the message and bans the author, revoking sessions", async () => {
    const { ann, bob, report, id } = await reported();
    await report(bob);
    const admin = await makeAdmin("mod");
    const queue = await call(reportsRoute.GET, {
      cookie: admin.cookie,
      params: {},
    });
    expect(queue.json.reports).toHaveLength(1);
    expect(queue.json.reports[0]).toMatchObject({
      body: "rude words",
      details: "mean",
    });

    const res = await call(reportActionRoute.POST, {
      method: "POST",
      cookie: admin.cookie,
      body: { action: "ban", banDays: 7, note: "harassment" },
      params: { id: queue.json.reports[0].id },
    });
    expect(res.status).toBe(201);
    await expect(getSession(ann.cookie)).resolves.toBeNull();
    await expect(
      db.select().from(session).where(eq(session.userId, ann.id)),
    ).resolves.toHaveLength(0);
    expect(disconnected).toContain(ann.id);

    const history = await call(messagesRoute.GET, {
      cookie: bob.cookie,
      path: `/api/conversations/${id}/messages`,
      params: { id },
    });
    expect(history.json.messages[0].deletedAt).toBeTruthy();
    const remaining = await call(reportsRoute.GET, {
      cookie: admin.cookie,
      params: {},
    });
    expect(remaining.json.reports).toHaveLength(0);

    const audit = await call(auditRoute.GET, {
      cookie: admin.cookie,
      params: {},
    });
    expect(audit.json.entries.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(["user.ban", "report.ban"]),
    );
  });

  it("does not let admins act on themselves", async () => {
    const admin = await makeAdmin("mod");
    const res = await call(userActionRoute.POST, {
      method: "POST",
      cookie: admin.cookie,
      body: { action: "revoke-admin" },
      params: { id: admin.id },
    });
    expect(res.json.error.code).toBe("SELF_ACTION");
  });

  it("reports metrics", async () => {
    await reported();
    const admin = await makeAdmin("mod");
    const { json } = await call(metricsRoute.GET, {
      cookie: admin.cookie,
      params: {},
    });
    expect(json.users.total).toBe(3);
    expect(json.messagesToday).toBe(1);
    expect(json.messagesPerDay).toHaveLength(14);
  });
});
