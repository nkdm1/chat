import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted-foreground">Page not found.</p>
      <Button variant="outline" asChild>
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
