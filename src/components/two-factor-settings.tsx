"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { BackupCodes } from "@/components/backup-codes";
import { FormAlert } from "@/components/form-alert";
import { OtpField } from "@/components/otp-field";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

type Action = "enable" | "disable" | "regenerate";
type View =
  | { step: "idle" }
  | { step: "password"; action: Action }
  | { step: "scan"; qr: string; secret: string; codes: string[] }
  | { step: "codes"; codes: string[] };

const PASSWORD_ERRORS: Record<string, string> = {
  INVALID_PASSWORD: "Wrong password.",
};

type AuthError = { code?: string; status: number };
type ActionResult = { error: AuthError | null; codes?: string[]; uri?: string };

async function runAction(
  action: Action,
  password: string,
): Promise<ActionResult> {
  if (action === "enable") {
    const { data, error } = await authClient.twoFactor.enable({ password });
    if (data?.method !== "totp") {
      return { error };
    }
    return { error, codes: data.backupCodes, uri: data.totpURI };
  }
  if (action === "disable") {
    const { error } = await authClient.twoFactor.disable({ password });
    return { error };
  }
  const { data, error } = await authClient.twoFactor.generateBackupCodes({
    password,
  });
  return { error, codes: data?.backupCodes };
}

function passwordErrorMessage(error: AuthError) {
  const known = PASSWORD_ERRORS[error.code ?? ""];
  if (known) {
    return known;
  }
  return error.status === 429
    ? "Too many attempts. Try again shortly."
    : "Something went wrong. Try again.";
}

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<View>({ step: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [shake, setShake] = useState(0);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function reset() {
    setView({ step: "idle" });
    setPassword("");
    setCode("");
    setFormError(null);
  }

  async function submitPassword(action: Action) {
    setPending(true);
    setFormError(null);
    const res = await runAction(action, password);
    setPending(false);
    if (res.error) {
      return setFormError(passwordErrorMessage(res.error));
    }
    setPassword("");
    if (action === "disable") {
      reset();
      return router.refresh();
    }
    const codes = res.codes ?? [];
    if (action === "regenerate") {
      return setView({ step: "codes", codes });
    }
    const uri = res.uri ?? "";
    // The URI contains the secret: render the QR locally, never via a third party.
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 192 });
    setView({
      step: "scan",
      qr,
      secret: new URL(uri).searchParams.get("secret") ?? "",
      codes,
    });
  }

  async function verifyCode(value: string, codes: string[]) {
    if (pending) {
      return;
    }
    setPending(true);
    setFormError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: value });
    setPending(false);
    if (error) {
      setCode("");
      setShake((n) => n + 1);
      return setFormError("That code didn't work.");
    }
    setCode("");
    setView({ step: "codes", codes });
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-medium">Two-factor authentication</h2>
          <p className="text-muted-foreground">
            {enabled ? "On. Authenticator app required at sign in." : "Off."}
          </p>
        </div>
        {view.step === "idle" && (
          <Button
            variant={enabled ? "outline" : "default"}
            onClick={() =>
              setView({
                step: "password",
                action: enabled ? "disable" : "enable",
              })
            }
          >
            {enabled ? "Disable" : "Enable"}
          </Button>
        )}
      </div>

      {view.step === "idle" && enabled && (
        <button
          type="button"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => setView({ step: "password", action: "regenerate" })}
        >
          Generate new backup codes
        </button>
      )}

      {view.step === "password" && (
        <form
          className="animate-enter space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPassword(view.action);
          }}
        >
          <FormAlert>{formError}</FormAlert>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Current password"
            placeholder="Current password"
            autoComplete="current-password"
            autoFocus
            required
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !password}>
              {pending && <Spinner />}
              Confirm
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {view.step === "scan" && (
        <div className="animate-enter space-y-4">
          <p className="text-muted-foreground">
            Scan with your authenticator app, then enter the 6-digit code.
          </p>
          {/* Local data URL: nothing for next/image to optimize. */}
          {/* oxlint-disable-next-line nextjs/no-img-element */}
          <img
            src={view.qr}
            alt="Authenticator QR code"
            width={192}
            height={192}
            className="rounded-lg border bg-white"
          />
          <p className="text-muted-foreground">
            Or enter the key{" "}
            <code className="font-mono text-foreground">{view.secret}</code>
          </p>
          <FormAlert>{formError}</FormAlert>
          <OtpField
            value={code}
            onChange={setCode}
            onComplete={async (v) => await verifyCode(v, view.codes)}
            disabled={pending}
            shakeKey={shake}
          />
          <Button variant="ghost" onClick={reset}>
            Cancel
          </Button>
        </div>
      )}

      {view.step === "codes" && (
        <div className="space-y-3">
          <BackupCodes codes={view.codes} />
          <Button onClick={reset}>Done</Button>
        </div>
      )}
    </section>
  );
}
