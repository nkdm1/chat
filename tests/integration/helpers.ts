import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import * as email from "@/lib/email";

const ORIGIN = "http://localhost:3000";

export const PASSWORD = "correct-horse-battery";

export async function resetDb() {
  await db.execute(
    sql`truncate "user", "session", "account", "verification", "two_factor", "rate_limit" cascade`,
  );
  vi.mocked(email.sendMailInBackground).mockClear();
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

export function signUp(overrides: Record<string, string> = {}) {
  return post("/sign-up/email", {
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
  const mail = calls[calls.length - 1]?.[0];
  const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("no mail with a link was sent");
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

export function getSession(cookie: string) {
  return auth.api.getSession({ headers: new Headers({ cookie }) });
}
