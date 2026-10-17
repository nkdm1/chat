"use client";

import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState("pending");
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/verify-email",
    });
    if (error) {
      setError(authErrorMessage(error));
      return setState("error");
    }
    setState("sent");
  }

  if (state === "sent") {
    return <p className="animate-enter text-muted-foreground">Sent again.</p>;
  }
  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={resend} disabled={state === "pending"}>
        {state === "pending" && <Spinner />}
        Resend email
      </Button>
      {state === "error" && (
        <p role="alert" className="animate-enter text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
