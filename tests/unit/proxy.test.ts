import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

describe("proxy", () => {
  it("sets a per-request CSP nonce and the Web PubSub origin from env", () => {
    const res = proxy(new NextRequest("http://localhost:3000/"));
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
    );
    expect(csp).toContain("connect-src 'self' ws://localhost:8085");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    const other = proxy(new NextRequest("http://localhost:3000/")).headers.get(
      "content-security-policy",
    );
    expect(other).not.toBe(csp);
  });

  it("redirects protected pages without a session cookie", () => {
    const res = proxy(new NextRequest("http://localhost:3000/admin"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in");
  });
});
