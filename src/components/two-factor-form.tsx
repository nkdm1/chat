"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/form-alert";
import { OtpField } from "@/components/otp-field";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function TwoFactorForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  async function verify(value: string) {
    if (pending || !value) {
      return;
    }
    setPending(true);
    setFormError(null);
    const verifyFn =
      mode === "totp"
        ? authClient.twoFactor.verifyTotp
        : authClient.twoFactor.verifyBackupCode;
    const { error } = await verifyFn({ code: value, trustDevice: trust });
    if (error) {
      setPending(false);
      setCode("");
      setShake((n) => n + 1);
      setFormError(
        error.status === 429
          ? "Too many attempts. Try again in a few minutes."
          : "That code didn't work.",
      );
      return;
    }
    router.push("/chat");
    router.refresh();
  }

  function switchMode() {
    setMode(mode === "totp" ? "backup" : "totp");
    setCode("");
    setFormError(null);
  }

  return (
    <div className="space-y-4">
      <FormAlert>{formError}</FormAlert>
      {mode === "totp" ? (
        <OtpField
          value={code}
          onChange={setCode}
          onComplete={verify}
          disabled={pending}
          shakeKey={shake}
          autoFocus
        />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(code.trim());
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Backup code"
            placeholder="Backup code"
            className="font-mono"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Spinner />}
            Verify
          </Button>
        </form>
      )}
      <label className="flex items-center gap-2 text-muted-foreground">
        <span className="relative inline-flex size-4 shrink-0">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
            className="peer size-4 cursor-pointer appearance-none rounded-[4px] border border-input bg-background transition-colors checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <Check
            aria-hidden
            strokeWidth={3}
            className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        Trust this device for 30 days
      </label>
      <button
        type="button"
        onClick={switchMode}
        className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {mode === "totp" ? "Use a backup code" : "Use authenticator app"}
      </button>
    </div>
  );
}
