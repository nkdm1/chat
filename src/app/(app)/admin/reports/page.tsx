import type { Metadata } from "next";
import { AdminReports } from "@/components/admin/admin-reports";

export const metadata: Metadata = { title: "Reports · Admin" };

export default function ReportsPage() {
  return <AdminReports />;
}
