import { uuidSchema } from "@/lib/validation";
import { memberIds, requireMember } from "@/server/conversations";
import { parse, withUser } from "@/server/http";
import { realtime } from "@/server/realtime";
import { markTyping } from "@/server/typing";

export const POST = withUser<{ id: string }>(
  { skipWriteLimit: true },
  async ({ user, params }) => {
    const conversationId = parse(uuidSchema, params.id);
    await requireMember(user.id, conversationId);
    // Only the first ping in each 3 s window fans out.
    if (await markTyping(conversationId, user.id)) {
      const members = await memberIds(conversationId);
      const others = members.filter((id) => id !== user.id);
      await realtime().toUsers(others, {
        type: "typing",
        conversationId,
        userId: user.id,
        username: user.username,
      });
    }
  },
);
