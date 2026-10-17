"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormAlert } from "@/components/form-alert";
import { ResendVerification } from "@/components/resend-verification";
import { Spinner } from "@/components/spinner";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { type SignUpValues, signUpSchema } from "@/lib/validation";

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { username: "", email: "", password: "", confirm: "" },
  });

  async function onSubmit(values: SignUpValues) {
    setError(null);
    const { error } = await authClient.signUp.email({
      username: values.username,
      email: values.email,
      password: values.password,
      name: values.username,
      callbackURL: "/verify-email",
    });
    if (error) return setError(authErrorMessage(error));
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <div className="animate-enter space-y-4">
        <p>
          Check your inbox. We sent a link to{" "}
          <span className="font-medium">{sentTo}</span>.
        </p>
        <ResendVerification email={sentTo} />
      </div>
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="space-y-4"
    >
      <FormAlert>{error}</FormAlert>
      <FieldGroup>
        <TextField
          control={form.control}
          name="username"
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          control={form.control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
        />
        <TextField
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="confirm"
          label="Repeat password"
          type="password"
          autoComplete="new-password"
        />
      </FieldGroup>
      <Button
        type="submit"
        className="w-full"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting && <Spinner />}
        Create account
      </Button>
    </form>
  );
}
