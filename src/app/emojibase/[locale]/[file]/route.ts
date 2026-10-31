import data from "emojibase-data/en/data.json";
import messages from "emojibase-data/en/messages.json";

// Emoji data for the picker, served from our own origin: the CSP only allows
// same-origin fetches, so the library's CDN default would be blocked.
const FILES: Record<string, unknown> = {
  "data.json": data,
  "messages.json": messages,
};

const headers = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "Content-Type": "application/json",
};

function lookup(locale: string, file: string) {
  return locale === "en" ? FILES[file] : undefined;
}

export async function GET(
  _req: Request,
  ctx: RouteContext<"/emojibase/[locale]/[file]">,
) {
  const { locale, file } = await ctx.params;
  const body = lookup(locale, file);
  return body
    ? Response.json(body, { headers })
    : new Response(null, { status: 404 });
}

export async function HEAD(
  _req: Request,
  ctx: RouteContext<"/emojibase/[locale]/[file]">,
) {
  const { locale, file } = await ctx.params;
  return new Response(null, {
    status: lookup(locale, file) ? 200 : 404,
    headers,
  });
}
