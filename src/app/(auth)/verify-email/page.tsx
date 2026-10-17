import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ResendForm } from "@/components/resend-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Verify email" };

// Landing page for the verification link. On success Better Auth has already
// signed the user in, so we just forward to the app.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!error && (await getSession())) redirect("/chat");

  return (
    <AuthShell title={error ? "Link expired" : "Verify email"}>
      <p className="text-muted-foreground">
        {error
          ? "This verification link is invalid or has expired."
          : "Open the link we emailed you."}
      </p>
      <ResendForm />
    </AuthShell>
  );
}
