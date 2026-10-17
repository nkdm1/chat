/** Test database URL: same server as DATABASE_URL, separate database. */
export function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base =
    process.env.DATABASE_URL ?? "postgres://chat:chat@localhost:5432/chat";
  const url = new URL(base);
  url.pathname = "/chat_test";
  return url.toString();
}
