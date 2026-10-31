import { unfriend } from "@/server/friends";
import { withUser } from "@/server/http";

export const DELETE = withUser<{ userId: string }>(
  {},
  async ({ user, params }) => {
    await unfriend(user.id, params.userId);
  },
);
