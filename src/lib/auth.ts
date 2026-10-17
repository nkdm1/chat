import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

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
  plugins: [nextCookies()], // must stay last
});
