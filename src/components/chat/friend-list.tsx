"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { keys, useFriends } from "@/hooks/chat-queries";
import { api } from "@/lib/api";
import { ListSkeleton } from "./conversation-list";
import { useRealtime } from "./realtime-provider";
import { UserAvatar } from "./user-avatar";

export function FriendList() {
  const qc = useQueryClient();
  const router = useRouter();
  const { connected } = useRealtime();
  const confirm = useConfirm();
  const { data, isPending } = useFriends(!connected);
  const open = useMutation({
    mutationFn: async (userId: string) =>
      await api.post<{ id: string }>("/api/conversations/direct", { userId }),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: keys.conversations });
      router.push(`/chat/${id}`);
    },
  });
  const unfriend = useMutation({
    mutationFn: async (userId: string) =>
      await api.delete(`/api/friends/${userId}`),
    onSettled: async () =>
      await qc.invalidateQueries({ queryKey: keys.friends }),
  });

  if (isPending) {
    return <ListSkeleton />;
  }
  if (!data?.friends.length) {
    return (
      <p className="px-2 py-6 text-center text-muted-foreground">
        No friends yet. Share your code above.
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {data.friends.map((f) => (
        <li
          key={f.userId}
          className="group flex items-center rounded-lg hover:bg-muted/60"
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left"
            onClick={() => open.mutate(f.userId)}
          >
            <UserAvatar name={f.username} online={f.online} />
            <span className="min-w-0">
              <span className="block truncate">{f.username}</span>
              <span className="block text-muted-foreground text-xs">
                {f.online ? "online" : "offline"}
              </span>
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
                aria-label={`Options for ${f.username}`}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => open.mutate(f.userId)}>
                Message
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  const ok = await confirm({
                    title: `Remove ${f.username}?`,
                    description:
                      "You can still read your old messages, but not send new ones.",
                    action: "Remove friend",
                    destructive: true,
                  });
                  if (ok) {
                    unfriend.mutate(f.userId);
                  }
                }}
              >
                Remove friend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  );
}
