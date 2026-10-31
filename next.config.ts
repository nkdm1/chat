import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The Content-Security-Policy is set per request in src/proxy.ts (runtime
// config + script nonce). These headers are static.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  output: "standalone", // small self-contained server for the Docker image
  // Node SDKs: keep them out of the server bundle.
  serverExternalPackages: [
    "@azure/cosmos",
    "@azure/storage-blob",
    "@azure/web-pubsub",
    "@azure/identity",
    "@azure/communication-email",
    "ioredis",
  ],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Next requires an async function here.
  // oxlint-disable-next-line typescript/require-await
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
