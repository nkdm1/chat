import type { Metadata } from "next";
import { LogoutButton } from "@/components/logout-button";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <div className="flex flex-1">
      <aside
        aria-hidden
        className="hidden w-64 shrink-0 space-y-3 border-r p-4 md:block"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </aside>
      <main className="flex flex-1 animate-enter flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">Chat will be implemented soon.</p>
        <LogoutButton />
      </main>
    </div>
  );
}
