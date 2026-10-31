// Usage: pnpm admin:grant you@example.com
// Bootstraps the first admin; later admins are managed in /admin.
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { user } from "../src/db/schema";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: pnpm admin:grant <email>");
  process.exit(1);
}

const [row] = await db
  .update(user)
  .set({ role: "admin" })
  .where(eq(user.email, email))
  .returning({ username: user.username });
console.log(
  row ? `${row.username} is now an admin.` : `No user with email ${email}.`,
);
process.exit(row ? 0 : 1);
