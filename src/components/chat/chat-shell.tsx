"use client";

import { cn } from "cn";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";

/** Sidebar + conversation. On small screens only one of them is shown. */
export function ChatShell({ children }: { children: ReactNode }) {
  const { conversationId } = useParams<{ conversationId?: string }>();
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "w-full shrink-0 border-r md:w-80",
          conversationId ? "hidden md:block" : "block",
        )}
      >
        <Sidebar />
      </aside>
      <main
        className={cn(
          "min-w-0 flex-1",
          conversationId ? "flex" : "hidden md:flex",
        )}
      >
        {children}
      </main>
    </div>
  );
}
