import { uuidSchema } from "@/lib/validation";
import { uploadAttachment } from "@/server/attachments";
import { parse, withUser } from "@/server/http";

export const POST = withUser<{ id: string }>(
  { limit: "upload" },
  async ({ req, user, params }) =>
    await uploadAttachment(user.id, parse(uuidSchema, params.id), req),
);
