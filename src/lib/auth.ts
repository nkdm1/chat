import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendMailInBackground } from "@/lib/email";
import { resetPasswordEmail, verificationEmail } from "@/lib/email-templates";
import { env } from "@/lib/env";
import { signUpApiSchema } from "@/lib/validation";

export const auth = betterAuth({
  appName: "chat",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    // Unverified users can't sign in; a new link is sent on each attempt.
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 30, // single-use, 30 minutes
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      sendMailInBackground(resetPasswordEmail(user, url));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      sendMailInBackground(verificationEmail(user, url));
    },
  },
  user: {
    additionalFields: {
      username: { type: "string", required: true, unique: true },
    },
  },
  session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60 },
  advanced: {
    // Secure cookies whenever the public URL is https (browsers drop them on plain http).
    useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
    // Explicit so origin/CSRF validation also runs under test runners, where
    // Better Auth would otherwise turn it off by default.
    disableOriginCheck: false,
  },
  trustedOrigins: [env.BETTER_AUTH_URL],
  rateLimit: {
    enabled: !process.env.VITEST, // tests fire many sign-ins from one "IP"
    storage: "database",
    // Endpoints that send mail or check secrets get a tighter budget.
    customRules: {
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
      "/two-factor/verify-totp": { window: 60, max: 10 },
      "/two-factor/verify-backup-code": { window: 60, max: 10 },
    },
  },
  hooks: {
    // Authoritative server-side validation; the client schema is only for UX.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const parsed = signUpApiSchema.safeParse(ctx.body);
      if (!parsed.success) {
        throw new APIError("BAD_REQUEST", {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }
      const taken = await db.query.user.findFirst({
        where: eq(schema.user.username, parsed.data.username),
        columns: { id: true },
      });
      if (taken) {
        throw new APIError("UNPROCESSABLE_ENTITY", {
          code: "USERNAME_TAKEN",
          message: "Username is taken",
        });
      }
      // Continue with the normalized values (trimmed, lowercased).
      return { context: { ...ctx, body: { ...ctx.body, ...parsed.data } } };
    }),
  },
  plugins: [
    twoFactor({ issuer: "chat" }), // TOTP + backup codes, lockout after repeated failures
    nextCookies(), // must stay last
  ],
});
