import type { ReactNode } from "react";
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
    <div className="flex min-h-dvh flex-col px-4 py-5 sm:px-6">
      <Logo />
      <main className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center pb-16">
        <div className="animate-enter space-y-6">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {children}
          {footer && <p className="text-muted-foreground">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
