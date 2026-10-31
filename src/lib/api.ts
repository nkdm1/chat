// Same-origin JSON client for our API. Errors carry the server's stable code.

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

function errorOf(data: unknown): { code?: string; message?: string } {
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return {};
  }
  const { error } = data;
  if (typeof error !== "object" || error === null) {
    return {};
  }
  return {
    code:
      "code" in error && typeof error.code === "string"
        ? error.code
        : undefined,
    message:
      "message" in error && typeof error.message === "string"
        ? error.message
        : undefined,
  };
}

/** FormData goes as multipart (browser sets the boundary); anything else as JSON. */
function encode(body: unknown): RequestInit {
  if (body === undefined) {
    return {};
  }
  if (body instanceof FormData) {
    return { body };
  }
  return {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    ...encode(body),
  });
  const data: unknown = res.headers.get("content-type")?.includes("json")
    ? await res.json()
    : null;
  if (!res.ok) {
    const error = errorOf(data);
    throw new ApiClientError(
      res.status,
      error.code ?? "UNKNOWN",
      res.status === 429
        ? "Too many requests. Slow down a little."
        : (error.message ?? "Something went wrong. Try again."),
    );
  }
  // The API contract is typed by the caller; responses come from our own server.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return data as T;
}

export const api = {
  get: async <T>(path: string) => await request<T>("GET", path),
  post: async <T>(path: string, body?: unknown) =>
    await request<T>("POST", path, body ?? {}),
  patch: async <T>(path: string, body: unknown) =>
    await request<T>("PATCH", path, body),
  delete: async <T>(path: string) => await request<T>("DELETE", path),
};

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}
