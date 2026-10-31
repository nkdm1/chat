import { uuidSchema } from "@/lib/validation";
import { acceptFriendRequest } from "@/server/friends";
import { parse, withUser } from "@/server/http";

export const POST = withUser<{ id: string }>({}, async ({ user, params }) => {
  await acceptFriendRequest(user.id, parse(uuidSchema, params.id));
});
