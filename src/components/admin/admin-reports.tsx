"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { fullTime } from "@/lib/format";

type Status = "open" | "resolved" | "dismissed";

type Report = {
  id: string;
  reason: string;
  details: string | null;
  body: string;
  attachmentIds: string[];
  status: Status;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; username: string };
  author: { id: string; username: string; banned: boolean | null };
};

type Action = {
  action: "dismiss" | "delete-message" | "ban";
  banDays?: 1 | 7 | 30 | null;
};

const BAN_OPTIONS = [
  { label: "1 day", banDays: 1 },
  { label: "7 days", banDays: 7 },
  { label: "30 days", banDays: 30 },
  { label: "Permanently", banDays: null },
] as const;

function ReportCard({
  report,
  onAct,
  busy,
}: {
  report: Report;
  onAct: (a: Action) => void;
  busy: boolean;
}) {
  return (
    <li className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-xs capitalize">
          {report.reason}
        </span>
        <span>
          <span className="font-medium">{report.author.username}</span>
          <span className="text-muted-foreground"> reported by </span>
          <span className="font-medium">{report.reporter.username}</span>
        </span>
        <span className="ml-auto text-muted-foreground text-xs">
          {fullTime(report.createdAt)}
        </span>
      </div>
      <blockquote className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">
        {report.body || (
          <span className="text-muted-foreground italic">(no text)</span>
        )}
      </blockquote>
      {report.attachmentIds.length > 0 && (
        <p className="flex flex-wrap gap-2 text-sm">
          {report.attachmentIds.map((id, i) => (
            <a
              key={id}
              href={`/api/attachments/${id}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Attachment {i + 1}
            </a>
          ))}
        </p>
      )}
      {report.details && (
        <p className="text-muted-foreground text-sm">“{report.details}”</p>
      )}
      {report.status === "open" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onAct({ action: "dismiss" })}
          >
            Dismiss
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onAct({ action: "delete-message" })}
          >
            Delete message
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy || !!report.author.banned}
              >
                Delete & ban
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Ban {report.author.username}
              </DropdownMenuLabel>
              {BAN_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.label}
                  onSelect={() => onAct({ action: "ban", banDays: o.banDays })}
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {report.resolution?.replace("_", " ")} ·{" "}
          {report.resolvedAt && fullTime(report.resolvedAt)}
        </p>
      )}
    </li>
  );
}

export function AdminReports() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("open");
  const [failure, setFailure] = useState<string | null>(null);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "reports", status],
    queryFn: async () =>
      await api.get<{ reports: Report[] }>(
        `/api/admin/reports?status=${status}`,
      ),
  });
  const act = useMutation({
    mutationFn: async ({ id, ...body }: Action & { id: string }) =>
      await api.post(`/api/admin/reports/${id}`, body),
    onSuccess: () => setFailure(null),
    onError: (error) => setFailure(errorMessage(error)),
    onSettled: async () => await qc.invalidateQueries({ queryKey: ["admin"] }),
  });

  return (
    <div className="space-y-4">
      <Tabs
        value={status}
        onValueChange={(v) =>
          setStatus(v === "resolved" || v === "dismissed" ? v : "open")
        }
      >
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>
      {failure && (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      )}
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {data?.reports.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-muted-foreground">
          {status === "open" ? "Nothing to review. 🎉" : "No reports here."}
        </p>
      )}
      <ul className="space-y-3">
        {data?.reports.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            busy={act.isPending}
            onAct={(a) => act.mutate({ id: r.id, ...a })}
          />
        ))}
      </ul>
    </div>
  );
}
