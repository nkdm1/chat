import { z } from "zod";
import { actOnUser } from "@/server/admin";
import { readJson, withUser } from "@/server/http";

const body = z.object({
  action: z.enum(["ban", "unban", "make-admin", "revoke-admin"]),
  banDays: z
    .union([z.literal(1), z.literal(7), z.literal(30), z.null()])
    .optional(),
  reason: z.string().trim().max(300).optional(),
});

export const POST = withUser<{ id: string }>(
  { admin: true },
  async ({ req, user, params }) => {
    await actOnUser(user, params.id.slice(0, 64), await readJson(req, body));
  },
);
