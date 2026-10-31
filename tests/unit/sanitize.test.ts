import { describe, expect, it } from "vitest";
import { sanitizeLine, sanitizeText } from "@/server/sanitize";

describe("sanitizeText", () => {
  it.each([
    ["<script>alert(1)</script>hi", "hi"],
    ['<img src=x onerror="alert(1)">', ""],
    ['<a href="javascript:alert(1)">click</a>', "click"],
    ["<b>bold</b> text", "bold text"],
  ])("strips markup: %s", (input, expected) => {
    expect(sanitizeText(input)).toBe(expected);
  });

  it.each([["a < b"], ["<3"], ["Tom & Jerry"], ["x > y"], ["&amp;"]])(
    "keeps ordinary text: %s",
    (input) => {
      expect(sanitizeText(input)).toBe(input === "&amp;" ? "&" : input);
    },
  );

  it("removes control and bidi characters but keeps emoji joiners", () => {
    expect(sanitizeText("a\u0000b‮c​d")).toBe("abcd");
    expect(sanitizeText("👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });

  it("normalizes line breaks and trims", () => {
    expect(sanitizeText("  a\r\n\n\n\n\nb  ")).toBe("a\n\n\nb");
    expect(sanitizeLine(" two\nlines ")).toBe("two lines");
  });
});
