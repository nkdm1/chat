import { z } from "zod";

// The only place that reads process.env. Everything is runtime config (no
// NEXT_PUBLIC_*), so one image can be promoted through every environment.
//
// Azure services follow one pattern: *_CONNECTION_STRING for local emulators,
// or *_ENDPOINT for Azure, authenticated with managed identity (no keys).

const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32, "use `openssl rand -base64 32`"),
    BETTER_AUTH_URL: z.url(),

    // Email: "smtp" (Mailpit locally) or "acs" (Azure Communication Services).
    EMAIL_PROVIDER: z.enum(["smtp", "acs"]).default("smtp"),
    MAIL_FROM: z.string().min(1),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: optional,
    SMTP_PASS: optional,
    ACS_CONNECTION_STRING: optional,
    ACS_ENDPOINT: optional,
    ACS_SENDER_ADDRESS: optional,

    // Redis is a cache: the app keeps working (degraded) without it.
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

    COSMOS_CONNECTION_STRING: optional,
    COSMOS_ENDPOINT: optional,
    COSMOS_DATABASE: z.string().min(1).default("chat"),
    COSMOS_MESSAGES_CONTAINER: z.string().min(1).default("messages"),

    WEBPUBSUB_CONNECTION_STRING: optional,
    WEBPUBSUB_ENDPOINT: optional,
    WEBPUBSUB_HUB: z.string().min(1).default("chat"),
    // Origin browsers open the socket to (CSP connect-src). Derived from the
    // endpoint when unset: http -> ws, https -> wss.
    WEBPUBSUB_CLIENT_ORIGIN: optional,

    AZURE_STORAGE_CONNECTION_STRING: optional,
    AZURE_STORAGE_ACCOUNT_URL: optional,
    AZURE_STORAGE_CONTAINER: z.string().min(1).default("attachments"),

    // Create the Cosmos database/container and blob container if missing.
    // Local emulators only; in Azure, OpenTofu owns these resources.
    AUTO_PROVISION: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    const oneOf = (a: keyof typeof env, b: keyof typeof env) => {
      if (!env[a] && !env[b]) {
        ctx.addIssue({
          code: "custom",
          path: [a],
          message: `set ${a} or ${b}`,
        });
      }
    };
    oneOf("COSMOS_CONNECTION_STRING", "COSMOS_ENDPOINT");
    oneOf("WEBPUBSUB_CONNECTION_STRING", "WEBPUBSUB_ENDPOINT");
    oneOf("AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_ACCOUNT_URL");
    if (env.EMAIL_PROVIDER === "smtp") {
      if (!env.SMTP_HOST) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_HOST"],
          message: "required for smtp",
        });
      }
      if (!env.SMTP_PORT) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_PORT"],
          message: "required for smtp",
        });
      }
    } else {
      oneOf("ACS_CONNECTION_STRING", "ACS_ENDPOINT");
      if (!env.ACS_SENDER_ADDRESS) {
        ctx.addIssue({
          code: "custom",
          path: ["ACS_SENDER_ADDRESS"],
          message: "required for acs",
        });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

/** `Endpoint=...;AccessKey=...` -> the Endpoint value. */
function endpointFromConnectionString(cs: string) {
  return /(?:^|;)\s*Endpoint=([^;]+)/i.exec(cs)?.[1] ?? "";
}

export function webPubSubClientOrigin() {
  if (env.WEBPUBSUB_CLIENT_ORIGIN) {
    return env.WEBPUBSUB_CLIENT_ORIGIN;
  }
  const endpoint =
    env.WEBPUBSUB_ENDPOINT ??
    endpointFromConnectionString(env.WEBPUBSUB_CONNECTION_STRING ?? "");
  const url = new URL(endpoint);
  return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
}
