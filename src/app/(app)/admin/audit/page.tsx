import type { Metadata } from "next";
import { AdminAudit } from "@/components/admin/admin-audit";

export const metadata: Metadata = { title: "Audit log · Admin" };

export default function AuditPage() {
  return <AdminAudit />;
}
