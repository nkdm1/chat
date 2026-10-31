import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { vi } from "vitest";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import * as email from "@/lib/email";
import { resetMemoryLimits } from "@/server/rate-limit";
import { redis } from "@/server/redis";
import { resetFakes } from "../setup/fakes";

const ORIGIN = "http://localhost:3000";

export const PASSWORD = "correct-horse-battery";

export async function resetDb() {
  await db.execute(
    sql`truncate "user", "session", "account", "verification", "two_factor", "rate_limit",
      "friend_code", "friendship", "conversation", "conversation_member", "message_reaction",
      "attachment", "message_report", "message_stats_daily", "admin_audit_log" cascade`,
  );
  vi.mocked(email.sendMailInBackground).mockClear();
  resetFakes();
  resetMemoryLimits();
  if (redis.status === "ready") {
    await redis.flushdb();
  } // test db 15 only
}

export async function post(path: string, body: unknown, cookie?: string) {
  const res = await auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return {
    status: res.status,
    json: text ? JSON.parse(text) : null,
    setCookie: res.headers.get("set-cookie") ?? "",
    cookie: cookieHeader(res.headers),
  };
}

/** Turns Set-Cookie headers into a Cookie request header. */
export function cookieHeader(headers: Headers) {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

export async function signUp(overrides: Record<string, string> = {}) {
  return await post("/sign-up/email", {
    name: "ann",
    username: "ann",
    email: "ann@example.com",
    password: PASSWORD,
    callbackURL: "/verify-email",
    ...overrides,
  });
}

/** The most recent mail's link (verification or reset). */
export function lastMailUrl() {
  const calls = vi.mocked(email.sendMailInBackground).mock.calls;
  const mail = calls.at(-1)?.[0];
  const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) {
    throw new Error("no mail with a link was sent");
  }
  return url;
}

export async function follow(url: string) {
  const res = await auth.handler(new Request(url));
  return {
    status: res.status,
    location: res.headers.get("location") ?? "",
    cookie: cookieHeader(res.headers),
  };
}

/** Signs up, clicks the verification link and returns a session cookie. */
export async function createVerifiedUser(
  overrides: Record<string, string> = {},
) {
  await signUp(overrides);
  const { cookie } = await follow(lastMailUrl());
  return { cookie, email: overrides.email ?? "ann@example.com" };
}

export async function getSession(cookie: string) {
  return await auth.api.getSession({ headers: new Headers({ cookie }) });
}

type Handler<P> = (
  req: NextRequest,
  ctx: { params: Promise<P> },
) => Promise<Response>;

/** Calls an App Router route handler like the browser would (same origin). */
export async function call<P = Record<string, string>>(
  handler: Handler<P>,
  opts: {
    method?: string;
    path?: string;
    cookie?: string;
    body?: unknown;
    params: P;
    origin?: string | null;
    form?: FormData;
  },
) {
  const method = opts.method ?? "GET";
  const headers = new Headers();
  if (opts.cookie) {
    headers.set("cookie", opts.cookie);
  }
  if (opts.origin !== null) {
    headers.set("origin", opts.origin ?? ORIGIN);
  }
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers.set("content-type", "application/json");
  }
  const res = await handler(
    new NextRequest(`${ORIGIN}${opts.path ?? "/api/test"}`, {
      method,
      headers,
      body,
    }),
    { params: Promise.resolve(opts.params) },
  );
  const type = res.headers.get("content-type") ?? "";
  const json = type.includes("application/json") ? await res.json() : null;
  return { status: res.status, json, res };
}

/** A verified user with a session cookie and their id. */
export async function makeUser(name: string) {
  const { cookie } = await createVerifiedUser({
    name,
    username: name,
    email: `${name}@example.com`,
  });
  const session = await getSession(cookie);
  if (!session) {
    throw new Error("no session");
  }
  return { cookie, id: session.user.id, username: name };
}
