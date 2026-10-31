import { z } from "zod";
import { getOrCreateDirect } from "@/server/conversations";
import { readJson, withUser } from "@/server/http";

const body = z.object({ userId: z.string().min(1).max(64) });

export const POST = withUser({}, async ({ req, user }) => {
  const { userId } = await readJson(req, body);
  return await getOrCreateDirect(user.id, userId);
});
