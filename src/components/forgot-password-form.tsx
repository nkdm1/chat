"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormAlert } from "@/components/form-alert";
import { Spinner } from "@/components/spinner";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import type { ForgotPasswordValues } from "@/lib/validation";
import { forgotPasswordSchema } from "@/lib/validation";

export function ForgotPasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setFormError(null);
    const { error } = await authClient.requestPasswordReset({
      ...values,
      redirectTo: "/reset-password",
    });
    // Same message whether or not the account exists (no enumeration).
    if (error && error.status !== 400) {
      return setFormError(authErrorMessage(error));
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p className="animate-enter">
        If an account exists for that email, we sent a reset link.
      </p>
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="space-y-4"
    >
      <FormAlert>{formError}</FormAlert>
      <TextField
        control={form.control}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
      />
      <Button
        type="submit"
        className="w-full"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting && <Spinner />}
        Send link
      </Button>
    </form>
  );
}
