import { z } from "zod";
import { sendMessageSchema, uuidSchema } from "@/lib/validation";
import { parse, readJson, readQuery, withUser } from "@/server/http";
import { listMessages, sendMessage } from "@/server/messages/service";

const query = z.object({
  before: z.string().max(100).optional(),
  around: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const GET = withUser<{ id: string }>(
  {},
  async ({ req, user, params }) =>
    await listMessages(
      user.id,
      parse(uuidSchema, params.id),
      readQuery(req, query),
    ),
);

export const POST = withUser<{ id: string }>(
  { limit: "message" },
  async ({ req, user, params }) =>
    await sendMessage(
      user,
      parse(uuidSchema, params.id),
      await readJson(req, sendMessageSchema),
    ),
);
