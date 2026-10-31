import { z } from "zod";
import { uuidSchema } from "@/lib/validation";
import { addMembers } from "@/server/conversations";
import { parse, readJson, withUser } from "@/server/http";

const body = z.object({
  userIds: z.array(z.string().min(1).max(64)).min(1).max(49),
});

export const POST = withUser<{ id: string }>(
  {},
  async ({ req, user, params }) => {
    const { userIds } = await readJson(req, body);
    await addMembers(user.id, parse(uuidSchema, params.id), userIds);
  },
);
