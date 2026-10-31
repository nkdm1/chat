import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireSession } from "@/lib/session";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await requireSession();
  // Not "forbidden": don't reveal that the page exists. The API checks again.
  if (user.role !== "admin") {
    notFound();
  }
  return (
    <div className="mx-auto w-full max-w-5xl animate-enter space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-xl tracking-tight">Admin</h1>
        <p className="text-muted-foreground">
          Moderation and health of the chat.
        </p>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
