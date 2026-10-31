import { z } from "zod";
import { editMessageSchema } from "@/lib/validation";
import { readJson, readQuery, withUser } from "@/server/http";
import { deleteMessage, editMessage } from "@/server/messages/service";

const id = z.string().min(1).max(64);

export const PATCH = withUser<{ id: string }>(
  {},
  async ({ req, user, params }) => {
    const { conversationId, body } = await readJson(req, editMessageSchema);
    return await editMessage(user, conversationId, id.parse(params.id), body);
  },
);

const query = z.object({ conversationId: z.uuid() });

export const DELETE = withUser<{ id: string }>(
  {},
  async ({ req, user, params }) => {
    const { conversationId } = readQuery(req, query);
    return await deleteMessage(user, conversationId, id.parse(params.id));
  },
);
