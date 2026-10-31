"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { MessagesChart } from "./messages-chart";

type Metrics = {
  users: { total: number; verified: number; new7d: number; banned: number };
  online: number;
  messagesToday: number;
  activeConversations: number;
  openReports: number;
  storageBytes: number;
  messagesPerDay: { day: string; count: number }[];
};

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold text-2xl tabular-nums tracking-tight">
        {value}
      </p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function AdminOverview() {
  const { data } = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: async () => await api.get<Metrics>("/api/admin/metrics"),
    refetchInterval: 30_000,
  });
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Users"
          value={data.users.total}
          hint={`${data.users.verified} verified`}
        />
        <Tile label="New this week" value={data.users.new7d} />
        <Tile label="Online now" value={data.online} />
        <Tile label="Messages today" value={data.messagesToday} />
        <Tile
          label="Active chats"
          value={data.activeConversations}
          hint="with messages in 7 days"
        />
        <Tile label="Open reports" value={data.openReports} />
        <Tile label="Attachments" value={formatBytes(data.storageBytes)} />
        <Tile label="Banned users" value={data.users.banned} />
      </div>
      <div className="rounded-xl border bg-card p-4">
        <MessagesChart data={data.messagesPerDay} />
      </div>
    </div>
  );
}
