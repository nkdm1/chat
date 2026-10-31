import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
        <Logo />
        <UserMenu
          username={user.username}
          email={user.email}
          isAdmin={user.role === "admin"}
        />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
