import { z } from "zod";
import { uuidSchema } from "@/lib/validation";
import { actOnReport } from "@/server/admin";
import { parse, readJson, withUser } from "@/server/http";

const body = z.object({
  action: z.enum(["dismiss", "delete-message", "ban"]),
  banDays: z
    .union([z.literal(1), z.literal(7), z.literal(30), z.null()])
    .optional(),
  note: z.string().trim().max(300).optional(),
});

export const POST = withUser<{ id: string }>(
  { admin: true },
  async ({ req, user, params }) => {
    await actOnReport(
      user,
      parse(uuidSchema, params.id),
      await readJson(req, body),
    );
  },
);
