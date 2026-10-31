import { uuidSchema } from "@/lib/validation";
import { deleteFriendRequest } from "@/server/friends";
import { parse, withUser } from "@/server/http";

export const DELETE = withUser<{ id: string }>({}, async ({ user, params }) => {
  await deleteFriendRequest(user.id, parse(uuidSchema, params.id));
});
