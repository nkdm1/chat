"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted-foreground">Something went wrong.</p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
