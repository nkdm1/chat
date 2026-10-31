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
  EMAIL_PROVIDER: "smtp",
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15",
  AUTO_PROVISION: "true",
  // Messages use the in-memory store and realtime a fake (tests/setup/fakes.ts);
  // these only satisfy config validation.
  COSMOS_CONNECTION_STRING:
    "AccountEndpoint=http://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==;",
  WEBPUBSUB_CONNECTION_STRING:
    "Endpoint=http://localhost:8085;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;",
  AZURE_STORAGE_CONNECTION_STRING:
    "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://localhost:10000/devstoreaccount1;",
  AZURE_STORAGE_CONTAINER: "attachments-test",
});
