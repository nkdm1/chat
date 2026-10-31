import { uuidSchema } from "@/lib/validation";
import { downloadAttachment } from "@/server/attachments";
import { parse, withUser } from "@/server/http";

export const GET = withUser<{ id: string }>(
  {},
  async ({ user, params }) =>
    await downloadAttachment(user, parse(uuidSchema, params.id)),
);
