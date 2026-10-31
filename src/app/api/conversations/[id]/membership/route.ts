import { muteSchema, uuidSchema } from "@/lib/validation";
import { setMute } from "@/server/conversations";
import { parse, readJson, withUser } from "@/server/http";

export const PATCH = withUser<{ id: string }>(
  {},
  async ({ req, user, params }) => {
    const { mutedFor } = await readJson(req, muteSchema);
    return await setMute(user.id, parse(uuidSchema, params.id), mutedFor);
  },
);
