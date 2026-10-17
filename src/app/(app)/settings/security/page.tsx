import type { Metadata } from "next";
import Link from "next/link";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const { user } = await requireSession();
  return (
    <main className="mx-auto w-full max-w-xl animate-enter space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <Link
          href="/chat"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Chat
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Security</h1>
      </div>
      <TwoFactorSettings enabled={user.twoFactorEnabled ?? false} />
    </main>
  );
}
