import { z } from "zod";
import { groupNameSchema, uuidSchema } from "@/lib/validation";
import { getConversation, renameGroup } from "@/server/conversations";
import { parse, readJson, withUser } from "@/server/http";

export const GET = withUser<{ id: string }>(
  {},
  async ({ user, params }) =>
    await getConversation(user.id, parse(uuidSchema, params.id)),
);

const body = z.object({ name: groupNameSchema });

export const PATCH = withUser<{ id: string }>(
  {},
  async ({ req, user, params }) => {
    const { name } = await readJson(req, body);
    await renameGroup(user.id, parse(uuidSchema, params.id), name);
  },
);
