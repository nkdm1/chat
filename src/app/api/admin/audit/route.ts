import { listAudit } from "@/server/admin";
import { withUser } from "@/server/http";

export const GET = withUser({ admin: true }, async () => ({
  entries: await listAudit(),
}));
