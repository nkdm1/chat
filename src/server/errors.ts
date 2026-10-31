/** Errors with a stable, machine-readable code for the client. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export const notFound = (what = "Not found") =>
  new ApiError(404, "NOT_FOUND", what);
export const forbidden = (message = "Not allowed") =>
  new ApiError(403, "FORBIDDEN", message);
export const badRequest = (message: string, code = "VALIDATION_ERROR") =>
  new ApiError(400, code, message);
