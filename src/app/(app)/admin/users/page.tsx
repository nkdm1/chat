import type { Metadata } from "next";
import { AdminUsers } from "@/components/admin/admin-users";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Users · Admin" };

export default async function UsersPage() {
  const { user } = await requireSession();
  return <AdminUsers meId={user.id} />;
}
