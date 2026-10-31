import { z } from "zod";
import { listUsers } from "@/server/admin";
import { readQuery, withUser } from "@/server/http";

const query = z.object({ q: z.string().max(100).optional() });

export const GET = withUser({ admin: true }, async ({ req }) => ({
  users: await listUsers(readQuery(req, query).q),
}));
