import { reportSchema } from "@/lib/validation";
import { readJson, withUser } from "@/server/http";
import { reportMessage } from "@/server/messages/service";

export const POST = withUser<{ id: string }>(
  { limit: "report" },
  async ({ req, user, params }) => {
    const { conversationId, ...input } = await readJson(req, reportSchema);
    return await reportMessage(
      user.id,
      conversationId,
      params.id.slice(0, 64),
      input,
    );
  },
);
