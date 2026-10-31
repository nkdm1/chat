"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { keys, useFriendCode } from "@/hooks/chat-queries";
import { api } from "@/lib/api";
import { formatCode } from "@/lib/format";

export function FriendCodeCard() {
  const qc = useQueryClient();
  const { data } = useFriendCode();
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();
  const regenerate = useMutation({
    mutationFn: async () =>
      await api.post<{ code: string }>("/api/me/friend-code/regenerate"),
    onSuccess: (next) => qc.setQueryData(keys.friendCode, next),
  });

  async function copy() {
    if (!data) {
      return;
    }
    await navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5">
      <div>
        <p className="text-muted-foreground text-xs">Your friend code</p>
        {data ? (
          <p className="font-medium font-mono text-base tracking-wider">
            {formatCode(data.code)}
          </p>
        ) : (
          <Skeleton className="mt-1 h-5 w-20" />
        )}
      </div>
      <div className="flex">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          aria-label="Copy friend code"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Generate a new friend code"
          title="New code (the old one stops working)"
          disabled={regenerate.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: "Generate a new code?",
              description:
                "Your current code stops working. Pending requests stay.",
              action: "New code",
            });
            if (ok) {
              regenerate.mutate();
            }
          }}
        >
          <RefreshCwIcon />
        </Button>
      </div>
    </div>
  );
}
