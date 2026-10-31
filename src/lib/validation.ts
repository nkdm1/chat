import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(24, "At most 24 characters")
  .regex(/^[a-z0-9_]+$/, "Use letters, numbers and underscores");

export const emailSchema = z.email("Enter a valid email").trim().toLowerCase();

export const newPasswordSchema = z
  .string()
  .min(12, "At least 12 characters")
  .max(128, "At most 128 characters");

/** What the API accepts; also used by the server-side sign-up hook. */
export const signUpApiSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});

/** The sign-up form: same fields plus a repeated password (UI only). */
export const signUpSchema = signUpApiSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export type SignUpValues = z.input<typeof signUpSchema>;
export type SignInValues = z.input<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.input<typeof resetPasswordSchema>;

// ---- Chat ----------------------------------------------------------------
// Shared by the API (authoritative) and the UI (instant feedback).

export const MESSAGE_MAX = 2000;
export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "pdf",
  "txt",
];
export const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉"] as const;
export const GROUP_MAX_MEMBERS = 50;

export const uuidSchema = z.uuid("Invalid id");

/** "123 456", "123-456" and "123456" are all accepted. */
export const friendCodeSchema = z
  .string()
  .transform((v) => v.replaceAll(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Friend codes are 6 digits"));

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Name the group")
  .max(50, "At most 50 characters")
  .regex(
    /^[\p{L}\p{N} _\-.!?'&()]+$/u,
    "Letters, numbers and basic punctuation only",
  );

export const messageBodySchema = z
  .string()
  .max(MESSAGE_MAX * 2, `At most ${MESSAGE_MAX} characters`); // re-checked after sanitizing

export const sendMessageSchema = z.object({
  body: messageBodySchema.default(""),
  clientMessageId: z.uuid(),
  attachmentIds: z.array(z.uuid()).max(MAX_ATTACHMENTS).default([]),
  replyToId: z.string().min(1).max(64).optional(),
});

export const editMessageSchema = z.object({
  conversationId: z.uuid(),
  body: messageBodySchema,
});

export const createGroupSchema = z.object({
  name: groupNameSchema,
  memberIds: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(GROUP_MAX_MEMBERS - 1),
});

export const reportSchema = z.object({
  conversationId: z.uuid(),
  reason: z.enum(["spam", "harassment", "inappropriate", "other"]),
  details: z.string().trim().max(500, "At most 500 characters").optional(),
});

export const reactionSchema = z.object({
  conversationId: z.uuid(),
  emoji: z.enum(REACTION_EMOJI),
});

export const searchSchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(100),
});

export const muteSchema = z.object({
  // null = unmute; "forever" = until unmuted; otherwise hours.
  mutedFor: z.union([
    z.null(),
    z.literal("forever"),
    z.literal(1),
    z.literal(8),
    z.literal(24),
  ]),
});
