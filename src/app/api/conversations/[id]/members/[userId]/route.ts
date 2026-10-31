import { uuidSchema } from "@/lib/validation";
import { removeMember } from "@/server/conversations";
import { parse, withUser } from "@/server/http";

/** Owner removes a member, or a member leaves (their own id). */
export const DELETE = withUser<{ id: string; userId: string }>(
  {},
  async ({ user, params }) => {
    await removeMember(user.id, parse(uuidSchema, params.id), params.userId);
  },
);
