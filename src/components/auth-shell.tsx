import type { ReactNode } from "react";
import { ChatShowcase } from "@/components/chat-showcase";
import { Logo } from "@/components/logo";

export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-5 sm:px-8">
        <Logo />
        <main className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center pb-16">
          <div className="animate-enter space-y-6">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {children}
            {footer && <p className="text-muted-foreground">{footer}</p>}
          </div>
        </main>
      </div>
      <ChatShowcase />
    </div>
  );
}
