import { listFriends } from "@/server/friends";
import { withUser } from "@/server/http";

export const GET = withUser({}, async ({ user }) => await listFriends(user.id));
