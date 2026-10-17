import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/sign-in-form";
import { redirectIfSignedIn } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  await redirectIfSignedIn();
  const { reset } = await searchParams;
  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          No account?{" "}
          <Link
            href="/sign-up"
            className="text-foreground underline underline-offset-4"
          >
            Sign up
          </Link>
        </>
      }
    >
      {reset && (
        <p className="animate-enter text-muted-foreground">
          Password updated. Sign in with the new one.
        </p>
      )}
      <SignInForm />
    </AuthShell>
  );
}
