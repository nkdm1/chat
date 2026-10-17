import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { signUpSchema } from "@/lib/validation";

export const auth = betterAuth({
  appName: "chat",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      username: { type: "string", required: true, unique: true },
    },
  },
  session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60 },
  advanced: { useSecureCookies: env.NODE_ENV === "production" },
  trustedOrigins: [env.BETTER_AUTH_URL],
  rateLimit: { enabled: true, storage: "database" },
  hooks: {
    // Authoritative server-side validation; the client schema is only for UX.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const parsed = signUpSchema.safeParse(ctx.body);
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
  plugins: [nextCookies()], // must stay last
});
