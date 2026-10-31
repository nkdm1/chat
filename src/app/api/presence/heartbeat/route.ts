import { friendIds } from "@/server/friends";
import { withUser } from "@/server/http";
import { heartbeat } from "@/server/presence";
import { realtime } from "@/server/realtime";

export const POST = withUser({ skipWriteLimit: true }, async ({ user }) => {
  if (await heartbeat(user.id)) {
    await realtime().toUsers(await friendIds(user.id), {
      type: "presence",
      userId: user.id,
      online: true,
    });
  }
});
