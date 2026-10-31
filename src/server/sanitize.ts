import sanitizeHtml from "sanitize-html";

// User text is plain text. We strip any HTML markup with a real HTML parser
// (sanitize-html) as defense in depth, then normalize. Output is only ever
// rendered as React text, never via dangerouslySetInnerHTML.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
};

// Control characters (\p{Cc}, except \n), zero-width spaces and bidi
// overrides. Joiners (U+200C/D) stay: emoji sequences depend on them.
const INVISIBLE = /[\p{Cc}\u200B\uFEFF\u202A-\u202E\u2066-\u2069]/gu;

function stripInvisible(text: string) {
  return text.replaceAll(INVISIBLE, (char) => (char === "\n" ? char : ""));
}

export function sanitizeText(input: string): string {
  const stripped = sanitizeHtml(input.replaceAll(/\r\n?/g, "\n"), {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    // Drop the contents of dangerous elements entirely, not just the tags.
    nonTextTags: ["script", "style", "textarea", "noscript", "iframe", "title"],
  });
  // sanitize-html escapes text for HTML; we store text, so decode it back.
  // Safe: rendering escapes again.
  const text = stripped.replaceAll(
    /&(?:amp|lt|gt|quot|#39|#x27);/g,
    (m) => ENTITIES[m],
  );
  return stripInvisible(text.normalize("NFC"))

    .replaceAll(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Single-line variant for names and short labels. */
export function sanitizeLine(input: string): string {
  return sanitizeText(input).replaceAll(/\s+/g, " ");
}
