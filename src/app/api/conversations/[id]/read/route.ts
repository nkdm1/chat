import { uuidSchema } from "@/lib/validation";
import { markRead } from "@/server/conversations";
import { parse, withUser } from "@/server/http";

export const POST = withUser<{ id: string }>({}, async ({ user, params }) => {
  await markRead(user.id, parse(uuidSchema, params.id));
});
