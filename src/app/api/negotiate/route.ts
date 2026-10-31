import { withUser } from "@/server/http";
import { realtime } from "@/server/realtime";

// Returns a short-lived Web PubSub client URL. The user id comes from the
// validated session, never from the request. The URL is a bearer credential:
// no-store, never logged.
export const POST = withUser({}, async ({ user }) => ({
  url: await realtime().clientUrl(user.id),
}));
