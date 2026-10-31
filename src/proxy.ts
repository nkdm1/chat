import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env, webPubSubClientOrigin } from "@/lib/env";

const PROTECTED = ["/chat", "/settings", "/admin"];
const isDev = env.NODE_ENV !== "production";

// CSP is built per request, at runtime, so the Web PubSub origin comes from
// env (one image for every environment) and scripts are allowed by nonce
// instead of 'unsafe-inline'.
function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // inline style attributes (React/Radix)
    "img-src 'self' data: blob:", // data: 2FA QR; blob: local upload previews
    "font-src 'self'",
    `connect-src 'self' ${webPubSubClientOrigin()}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Optimistic redirect only: it checks that a session cookie exists, not that
  // it is valid. Real validation happens server-side (requireSession, withUser).
  if (
    PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !getSessionCookie(request)
  ) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except static assets and prefetches.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
