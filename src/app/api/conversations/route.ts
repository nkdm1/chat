import { createGroupSchema } from "@/lib/validation";
import { createGroup, listConversations } from "@/server/conversations";
import { readJson, withUser } from "@/server/http";

export const GET = withUser(
  {},
  async ({ user }) => await listConversations(user.id),
);

export const POST = withUser({}, async ({ req, user }) => {
  const { name, memberIds } = await readJson(req, createGroupSchema);
  return await createGroup(user.id, name, memberIds);
});
