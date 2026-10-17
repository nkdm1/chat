import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "New password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token || error) {
    return (
      <AuthShell title="Link expired">
        <p className="text-muted-foreground">
          This reset link is invalid or has expired.
        </p>
        <Link
          href="/forgot-password"
          className={buttonVariants({ variant: "outline" })}
        >
          Send a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="New password">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
