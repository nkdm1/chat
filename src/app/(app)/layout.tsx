import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
        <Logo />
        <UserMenu username={user.username} email={user.email} />
      </header>
      {children}
    </div>
  );
}
