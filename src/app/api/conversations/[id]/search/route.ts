import { searchSchema, uuidSchema } from "@/lib/validation";
import { limit, parse, readQuery, withUser } from "@/server/http";
import { searchMessages } from "@/server/messages/service";

export const GET = withUser<{ id: string }>(
  {},
  async ({ req, user, params }) => {
    await limit("search", user.id);
    const { q } = readQuery(req, searchSchema);
    return {
      results: await searchMessages(user.id, parse(uuidSchema, params.id), q),
    };
  },
);
