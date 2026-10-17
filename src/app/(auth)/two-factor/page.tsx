import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { TwoFactorForm } from "@/components/two-factor-form";

export const metadata: Metadata = { title: "Two-factor" };

export default function TwoFactorPage() {
  return (
    <AuthShell
      title="Two-factor code"
      footer={
        <Link
          href="/sign-in"
          className="text-foreground underline underline-offset-4"
        >
          Back to sign in
        </Link>
      }
    >
      <TwoFactorForm />
    </AuthShell>
  );
}
