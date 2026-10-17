type AuthError = { code?: string; status?: number; message?: string } | null;

const MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "This email is already registered.",
  USERNAME_TAKEN: "This username is taken.",
  INVALID_EMAIL_OR_PASSWORD: "Wrong email or password.",
  INVALID_EMAIL: "Enter a valid email.",
  PASSWORD_TOO_SHORT: "Password must be at least 12 characters.",
  PASSWORD_TOO_LONG: "Password must be at most 128 characters.",
  EMAIL_NOT_VERIFIED: "Verify your email first.",
};

/** Turns a Better Auth error into one short, user-facing sentence. */
export function authErrorMessage(error: AuthError): string {
  if (!error) return "Something went wrong. Try again.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return "Too many attempts. Try again in a minute.";
  if (error.status === 400 && error.message) return error.message;
  return "Something went wrong. Try again.";
}
