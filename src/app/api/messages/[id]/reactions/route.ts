import { reactionSchema } from "@/lib/validation";
import { readJson, withUser } from "@/server/http";
import { toggleReaction } from "@/server/messages/service";

export const POST = withUser<{ id: string }>(
  {},
  async ({ req, user, params }) => {
    const { conversationId, emoji } = await readJson(req, reactionSchema);
    return await toggleReaction(
      user.id,
      conversationId,
      params.id.slice(0, 64),
      emoji,
    );
  },
);
