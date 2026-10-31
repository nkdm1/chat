"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fullTime } from "@/lib/format";

type Entry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  admin: string | null;
};

function describe(metadata: Entry["metadata"]) {
  if (!metadata) {
    return "";
  }
  return Object.entries(metadata)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

export function AdminAudit() {
  const { data } = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: async () =>
      await api.get<{ entries: Entry[] }>("/api/admin/audit"),
  });
  if (data?.entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-10 text-center text-muted-foreground">
        No admin actions yet.
      </p>
    );
  }
  return (
    <ol className="divide-y rounded-xl border">
      {data?.entries.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm"
        >
          <span className="font-medium">{e.admin ?? "unknown"}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {e.action}
          </code>
          <span className="text-muted-foreground text-xs">
            {e.targetType} {e.targetId.slice(0, 8)}
          </span>
          {describe(e.metadata) && (
            <span className="text-muted-foreground text-xs">
              {describe(e.metadata)}
            </span>
          )}
          <span className="ml-auto text-muted-foreground text-xs">
            {fullTime(e.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  );
}
