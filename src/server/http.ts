import type { NextRequest } from "next/server";
import type { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { ApiError, badRequest, forbidden } from "@/server/errors";
import type { LimitName } from "@/server/rate-limit";
import { hit } from "@/server/rate-limit";

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  role: string;
};

export {
  ApiError,
  badRequest,
  forbidden,
  notFound,
} from "@/server/errors";

const MAX_JSON_BYTES = 16 * 1024;
const ORIGIN = new URL(env.BETTER_AUTH_URL).origin;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data ?? { ok: true }, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export async function readJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_JSON_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("Invalid JSON");
  }
  return parse(schema, body);
}

export function readQuery<S extends z.ZodType>(req: Request, schema: S) {
  return parse(schema, Object.fromEntries(new URL(req.url).searchParams));
}

export function parse<S extends z.ZodType>(
  schema: S,
  value: unknown,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? "Invalid input");
  }
  return result.data;
}

export async function limit(name: LimitName, subject: string) {
  const result = await hit(name, subject);
  if (!result.ok) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Slow down.", {
      "Retry-After": String(result.retryAfter),
    });
  }
}

type Options = {
  admin?: boolean;
  /** Extra limit on top of the catch-all "write" budget for mutating requests. */
  limit?: LimitName;
};

type Ctx<P> = { req: NextRequest; user: SessionUser; params: P };

async function authenticate(req: NextRequest, options: Options) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "Sign in first");
  }
  const { user } = session;
  if (!user.emailVerified) {
    throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Verify your email first");
  }
  if (user.banned) {
    throw new ApiError(403, "BANNED", "Your account is banned");
  }
  const role = user.role ?? "user";
  if (options.admin && role !== "admin") {
    throw forbidden();
  }
  return { id: user.id, username: user.username, email: user.email, role };
}

function errorResponse(req: NextRequest, error: unknown) {
  if (error instanceof ApiError) {
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
      error.headers,
    );
  }
  console.error("[api]", req.method, new URL(req.url).pathname, error);
  return json(
    { error: { code: "INTERNAL", message: "Something went wrong" } },
    500,
  );
}

/**
 * Wraps a route handler: session required (verified, not banned), same-origin
 * check on writes, rate limits, JSON responses with stable error codes.
 */
export function withUser<P = Record<string, never>>(
  options: Options,
  handler: (ctx: Ctx<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const mutating = !SAFE_METHODS.has(req.method);
      // CSRF: the session cookie is SameSite=Lax; also require our own Origin.
      if (mutating && req.headers.get("origin") !== ORIGIN) {
        throw forbidden("Cross-origin request blocked");
      }
      const user = await authenticate(req, options);
      if (mutating) {
        await limit("write", user.id);
      }
      if (options.limit) {
        await limit(options.limit, user.id);
      }

      const data = await handler({ req, user, params: await ctx.params });
      if (data instanceof Response) {
        return data;
      }
      return json(data, req.method === "POST" ? 201 : 200);
    } catch (error) {
      return errorResponse(req, error);
    }
  };
}
