import { metrics } from "@/server/admin";
import { withUser } from "@/server/http";

export const GET = withUser({ admin: true }, async () => await metrics());
