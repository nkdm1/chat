import { eq } from "drizzle-orm";
import { generate } from "otplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { account, session, user } from "@/db/schema";
import {
  createVerifiedUser,
  follow,
  getSession,
  lastMailUrl,
  PASSWORD,
  post,
  resetDb,
  signUp,
} from "./helpers";

vi.mock("@/lib/email", () => ({
  sendMail: vi.fn(),
  sendMailInBackground: vi.fn(),
}));

beforeEach(resetDb);

describe("registration", () => {
  it("creates an unverified user and sends a verification mail", async () => {
    const res = await signUp();
    expect(res.status).toBe(200);
    expect(res.json.token).toBeNull();
    const [row] = await db.select().from(user);
    expect(row.emailVerified).toBe(false);
    expect(lastMailUrl()).toContain("/api/auth/verify-email?token=");
  });

  it("stores a hash, never the plaintext password", async () => {
    await signUp();
    const [acc] = await db.select().from(account);
    expect(acc.password).toBeTruthy();
    expect(acc.password).not.toBe(PASSWORD);
    expect(acc.password).not.toContain(PASSWORD);
  });

  it("rejects invalid input on the server", async () => {
    const res = await signUp({ username: "A!", password: "short" });
    expect(res.status).toBe(400);
    expect(await db.select().from(user)).toHaveLength(0);
  });

  it("rejects a taken username (case-insensitive)", async () => {
    await signUp();
    const res = await signUp({ email: "other@example.com", username: "ANN" });
    expect(res.json.code).toBe("USERNAME_TAKEN");
  });

  it("does not create a second account for the same email", async () => {
    await signUp();
    await signUp({ username: "ann2" });
    expect(await db.select().from(user)).toHaveLength(1);
  });
});

describe("email verification", () => {
  it("blocks sign-in until verified, then allows it", async () => {
    await signUp();
    const blocked = await post("/sign-in/email", {
      email: "ann@example.com",
      password: PASSWORD,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.json.code).toBe("EMAIL_NOT_VERIFIED");

    const verify = await follow(lastMailUrl());
    expect(verify.status).toBe(302);
    expect(verify.cookie).toContain("session_token");

    const ok = await post("/sign-in/email", {
      email: "ann@example.com",
      password: PASSWORD,
    });
    expect(ok.status).toBe(200);
  });
});

describe("login and logout", () => {
  it("issues an HttpOnly, SameSite=Lax session cookie", async () => {
    await createVerifiedUser();
    const res = await post("/sign-in/email", {
      email: "ann@example.com",
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.setCookie).toMatch(/HttpOnly/i);
    expect(res.setCookie).toMatch(/SameSite=Lax/i);
  });

  it("gives the same error for a wrong password", async () => {
    await createVerifiedUser();
    const res = await post("/sign-in/email", {
      email: "ann@example.com",
      password: "wrong-wrong-wrong",
    });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    const unknown = await post("/sign-in/email", {
      email: "nobody@example.com",
      password: PASSWORD,
    });
    expect(unknown.json.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("rejects requests from a foreign origin", async () => {
    await createVerifiedUser();
    const res = await auth_handler_with_origin("https://evil.test");
    expect(res).toBe(403);
  });

  it("deletes the session on sign-out", async () => {
    const { cookie } = await createVerifiedUser();
    expect(await getSession(cookie)).not.toBeNull();
    const out = await post("/sign-out", {}, cookie);
    expect(out.status).toBe(200);
    expect(await getSession(cookie)).toBeNull();
    expect(await db.select().from(session)).toHaveLength(0);
  });
});

describe("password reset", () => {
  it("answers identically for known and unknown emails", async () => {
    await createVerifiedUser();
    vi.clearAllMocks();
    const unknown = await post("/request-password-reset", {
      email: "nobody@example.com",
      redirectTo: "/reset-password",
    });
    expect(
      (await import("@/lib/email")).sendMailInBackground,
    ).not.toHaveBeenCalled();
    const known = await post("/request-password-reset", {
      email: "ann@example.com",
      redirectTo: "/reset-password",
    });
    expect(known.status).toBe(unknown.status);
    expect(known.json).toEqual(unknown.json);
    expect(
      (await import("@/lib/email")).sendMailInBackground,
    ).toHaveBeenCalledTimes(1);
  });

  it("resets once, revokes old sessions and rejects token reuse", async () => {
    const { cookie } = await createVerifiedUser();
    await post("/request-password-reset", {
      email: "ann@example.com",
      redirectTo: "/reset-password",
    });
    const { location } = await follow(lastMailUrl());
    const token = new URL(location).searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await post("/reset-password", {
      newPassword: "brand-new-password-1",
      token,
    });
    expect(reset.status).toBe(200);

    const reuse = await post("/reset-password", {
      newPassword: "another-password-22",
      token,
    });
    expect(reuse.status).toBe(400);

    expect(await getSession(cookie)).toBeNull();
    const old = await post("/sign-in/email", {
      email: "ann@example.com",
      password: PASSWORD,
    });
    expect(old.status).toBe(401);
    const fresh = await post("/sign-in/email", {
      email: "ann@example.com",
      password: "brand-new-password-1",
    });
    expect(fresh.status).toBe(200);
  });

  it("rejects an invalid token", async () => {
    const res = await post("/reset-password", {
      newPassword: "brand-new-password-1",
      token: "nope",
    });
    expect(res.status).toBe(400);
  });
});

describe("two-factor authentication", () => {
  async function enable2fa() {
    const { cookie } = await createVerifiedUser();
    const enabled = await post(
      "/two-factor/enable",
      { password: PASSWORD },
      cookie,
    );
    expect(enabled.status).toBe(200);
    const secret = new URL(enabled.json.totpURI).searchParams.get(
      "secret",
    ) as string;
    const verified = await post(
      "/two-factor/verify-totp",
      { code: await generate({ secret }) },
      cookie,
    );
    expect(verified.status).toBe(200);
    return { secret, backupCodes: enabled.json.backupCodes as string[] };
  }

  it("requires a second step at sign-in and accepts a valid TOTP", async () => {
    const { secret } = await enable2fa();
    const login = await post("/sign-in/email", {
      email: "ann@example.com",
      password: PASSWORD,
    });
    expect(login.json.twoFactorRedirect).toBe(true);
    expect(await getSession(login.cookie)).toBeNull();

    const wrong = await post(
      "/two-factor/verify-totp",
      { code: "000000" },
      login.cookie,
    );
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    const ok = await post(
      "/two-factor/verify-totp",
      { code: await generate({ secret }) },
      login.cookie,
    );
    expect(ok.status).toBe(200);
    expect(await getSession(ok.cookie)).not.toBeNull();
  });

  it("accepts each backup code exactly once", async () => {
    const { backupCodes } = await enable2fa();
    const code = backupCodes[0];

    const first = await post("/sign-in/email", {
      email: "ann@example.com",
      password: PASSWORD,
    });
    const used = await post(
      "/two-factor/verify-backup-code",
      { code },
      first.cookie,
    );
    expect(used.status).toBe(200);

    const second = await post("/sign-in/email", {
      email: "ann@example.com",
      password: PASSWORD,
    });
    const reused = await post(
      "/two-factor/verify-backup-code",
      { code },
      second.cookie,
    );
    expect(reused.status).toBeGreaterThanOrEqual(400);
  });

  it("needs the password to disable 2FA", async () => {
    const { cookie } = await createVerifiedUser();
    await post("/two-factor/enable", { password: PASSWORD }, cookie);
    const bad = await post(
      "/two-factor/disable",
      { password: "wrong-wrong-wrong" },
      cookie,
    );
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const ok = await post(
      "/two-factor/disable",
      { password: PASSWORD },
      cookie,
    );
    expect(ok.status).toBe(200);
    const [row] = await db
      .select()
      .from(user)
      .where(eq(user.email, "ann@example.com"));
    expect(row.twoFactorEnabled).toBeFalsy();
  });
});

async function auth_handler_with_origin(origin: string) {
  const { auth } = await import("@/lib/auth");
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email: "ann@example.com", password: PASSWORD }),
    }),
  );
  return res.status;
}
