import type { ReactNode } from "react";

// Renders message text as React nodes only (never HTML): http(s) URLs become
// links, @mentions of members are highlighted. Everything else stays text.
const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(@[a-z0-9_]{3,24})/gi;

export function MessageText({
  text,
  usernames,
  mine,
}: {
  text: string;
  usernames: Set<string>;
  mine: boolean;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [token, url, mention] = match;
    const start = match.index;
    if (start > last) {
      parts.push(text.slice(last, start));
    }
    if (url) {
      parts.push(
        <a
          key={start}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all underline underline-offset-2"
        >
          {url}
        </a>,
      );
    } else if (mention && usernames.has(mention.slice(1).toLowerCase())) {
      parts.push(
        <span
          key={start}
          className={
            mine ? "font-semibold" : "rounded bg-online/15 px-0.5 font-medium"
          }
        >
          {mention}
        </span>,
      );
    } else {
      parts.push(token);
    }
    last = start + token.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}
