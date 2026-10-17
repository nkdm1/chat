import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Reuse one connection pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { pg?: postgres.Sql };
const client = globalForDb.pg ?? postgres(env.DATABASE_URL);
if (env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
