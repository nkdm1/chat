"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { keys, useFriends } from "@/hooks/chat-queries";
import { api } from "@/lib/api";
import { UserAvatar } from "./user-avatar";

export function FriendRequests() {
  const qc = useQueryClient();
  const { data } = useFriends();
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: keys.friends });
    await qc.invalidateQueries({ queryKey: keys.conversations });
  };
  const accept = useMutation({
    mutationFn: async (id: string) =>
      await api.post(`/api/friends/requests/${id}/accept`),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      await api.delete(`/api/friends/requests/${id}`),
    onSettled: refresh,
  });

  if (!data || (data.incoming.length === 0 && data.outgoing.length === 0)) {
    return null;
  }
  return (
    <section className="space-y-1" aria-label="Friend requests">
      <p className="px-1 font-medium text-muted-foreground text-xs">Requests</p>
      {data.incoming.map((r) => (
        <div
          key={r.requestId}
          className="flex animate-enter items-center gap-2.5 rounded-lg px-1 py-1.5"
        >
          <UserAvatar name={r.username} />
          <span className="flex-1 truncate">{r.username}</span>
          <Button
            size="icon-sm"
            aria-label={`Accept ${r.username}`}
            onClick={() => accept.mutate(r.requestId)}
          >
            <CheckIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Decline ${r.username}`}
            onClick={() => remove.mutate(r.requestId)}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      {data.outgoing.map((r) => (
        <div
          key={r.requestId}
          className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-muted-foreground"
        >
          <UserAvatar name={r.username} />
          <span className="flex-1 truncate">{r.username}</span>
          <span className="text-xs">pending</span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Cancel request to ${r.username}`}
            onClick={() => remove.mutate(r.requestId)}
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </section>
  );
}
