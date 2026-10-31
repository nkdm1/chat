import { z } from "zod";
import { listReports } from "@/server/admin";
import { readQuery, withUser } from "@/server/http";

const query = z.object({
  status: z.enum(["open", "resolved", "dismissed"]).default("open"),
});

export const GET = withUser({ admin: true }, async ({ req }) => ({
  reports: await listReports(readQuery(req, query).status),
}));
