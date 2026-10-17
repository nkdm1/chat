import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/sign-up-form";
import { redirectIfSignedIn } from "@/lib/session";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage() {
  await redirectIfSignedIn();
  return (
    <AuthShell
      title="Create account"
      footer={
        <>
          Have an account?{" "}
          <Link
            href="/sign-in"
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
