import { z } from "zod";
import { friendCodeSchema } from "@/lib/validation";
import { sendFriendRequest } from "@/server/friends";
import { limit, readJson, withUser } from "@/server/http";

const body = z.object({ code: friendCodeSchema });

// 6-digit codes: rate limits keep guessing impractical.
export const POST = withUser(
  { limit: "friendRequest" },
  async ({ req, user }) => {
    await limit("friendRequestDaily", user.id);
    const { code } = await readJson(req, body);
    return await sendFriendRequest(user, code);
  },
);
