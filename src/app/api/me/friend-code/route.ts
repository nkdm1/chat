import { getFriendCode } from "@/server/friends";
import { withUser } from "@/server/http";

export const GET = withUser({}, async ({ user }) => ({
  code: await getFriendCode(user.id),
}));
