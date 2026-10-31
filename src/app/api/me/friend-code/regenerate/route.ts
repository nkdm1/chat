import { regenerateFriendCode } from "@/server/friends";
import { withUser } from "@/server/http";

export const POST = withUser({}, async ({ user }) => ({
  code: await regenerateFriendCode(user.id),
}));
