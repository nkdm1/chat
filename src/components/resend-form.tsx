"use client";

import { useState } from "react";
import { ResendVerification } from "@/components/resend-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Used when the verification link failed: ask for the email, then resend.
export function ResendForm() {
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);

  if (confirmed) {
    return <ResendVerification email={confirmed} />;
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setConfirmed(email.trim().toLowerCase());
      }}
    >
      <Input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        aria-label="Email"
        autoComplete="email"
      />
      <Button type="submit" variant="outline" className="w-full">
        Send a new link
      </Button>
    </form>
  );
}
