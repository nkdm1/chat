import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { testDatabaseUrl } from "./test-db";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

// Creates chat_test if needed and applies the real migrations to it.
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1 });
  const exists =
    await admin`select 1 from pg_database where datname = ${dbName}`;
  if (exists.length === 0) {
    await admin.unsafe(`create database "${dbName}"`);
  }
  await admin.end();

  // "already exists, skipping" notices are expected on re-runs.
  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}
