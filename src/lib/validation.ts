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

export const signUpSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: newPasswordSchema,
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
