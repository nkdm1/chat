import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  // Reuse one connection pool across hot reloads in dev.
  var pgClient: postgres.Sql | undefined;
}

const client = globalThis.pgClient ?? postgres(env.DATABASE_URL);
if (env.NODE_ENV !== "production") {
  globalThis.pgClient = client;
}

export const db = drizzle(client, { schema });
