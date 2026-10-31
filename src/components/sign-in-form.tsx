"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { SignInValues } from "@/lib/validation";
import { signInSchema } from "@/lib/validation";

export function SignInForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInValues) {
    setFormError(null);
    setUnverified(null);
    const { data, error } = await authClient.signIn.email(values);
    if (error?.code === "EMAIL_NOT_VERIFIED") {
      return setUnverified(values.email.trim().toLowerCase());
    }
    if (error) {
      return setFormError(authErrorMessage(error));
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      return router.push("/two-factor");
    }
    router.push("/chat");
    router.refresh();
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="space-y-4"
    >
      <FormAlert>{formError}</FormAlert>
      {unverified && (
        <div className="animate-enter space-y-3 rounded-lg border p-3">
          <p>Verify your email first. We sent you a new link.</p>
          <ResendVerification email={unverified} />
        </div>
      )}
      <FieldGroup>
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
          autoComplete="current-password"
        />
        <Link
          href="/forgot-password"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Forgot password?
        </Link>
      </FieldGroup>
      <Button
        type="submit"
        className="w-full"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting && <Spinner />}
        Sign in
      </Button>
    </form>
  );
}
