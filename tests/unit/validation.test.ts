import { describe, expect, it } from "vitest";
import { authErrorMessage } from "@/lib/auth-errors";
import {
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";

const valid = {
  username: "ann_1",
  email: "ann@example.com",
  password: "correct-horse-battery",
};

describe("signUpSchema", () => {
  it("accepts valid input and normalizes it", () => {
    const parsed = signUpSchema.parse({
      ...valid,
      username: " Ann_1 ",
      email: "ANN@Example.com",
    });
    expect(parsed.username).toBe("ann_1");
    expect(parsed.email).toBe("ann@example.com");
  });

  it.each([
    ["short username", { username: "ab" }],
    ["long username", { username: "a".repeat(25) }],
    ["username with symbols", { username: "ann!" }],
    ["bad email", { email: "not-an-email" }],
    ["short password", { password: "short" }],
    ["long password", { password: "x".repeat(129) }],
  ])("rejects %s", (_, override) => {
    expect(signUpSchema.safeParse({ ...valid, ...override }).success).toBe(
      false,
    );
  });
});

describe("signInSchema", () => {
  it("requires a password", () => {
    expect(
      signInSchema.safeParse({ email: valid.email, password: "" }).success,
    ).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires matching passwords", () => {
    const bad = resetPasswordSchema.safeParse({
      password: valid.password,
      confirm: "other",
    });
    expect(bad.success).toBe(false);
    const ok = resetPasswordSchema.safeParse({
      password: valid.password,
      confirm: valid.password,
    });
    expect(ok.success).toBe(true);
  });
});

describe("authErrorMessage", () => {
  it("maps known codes", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "Wrong email or password.",
    );
  });
  it("maps rate limiting", () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/too many/i);
  });
  it("falls back to a generic message", () => {
    expect(authErrorMessage({ status: 500, message: "stack trace" })).toBe(
      "Something went wrong. Try again.",
    );
  });
});
