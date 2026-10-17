import { testDatabaseUrl } from "./test-db";

// Runs before each test file, ahead of the app's own env validation.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: testDatabaseUrl(),
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
  BETTER_AUTH_URL: "http://localhost:3000",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  MAIL_FROM: "chat <test@chat.local>",
});
