import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env on its own; CI/Docker pass real env vars.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
