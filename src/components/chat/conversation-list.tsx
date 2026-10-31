"use client";

import { cn } from "cn";
import { BellOffIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations, useFriends } from "@/hooks/chat-queries";
import { shortTime } from "@/lib/format";
import { useRealtime } from "./realtime-provider";
import { UserAvatar } from "./user-avatar";

export function ConversationList() {
  const { me, connected } = useRealtime();
  const { data, isPending } = useConversations(!connected);
  const { data: friends } = useFriends();
  const params = useParams<{ conversationId?: string }>();
  const online = new Set(
    friends?.friends.filter((f) => f.online).map((f) => f.userId),
  );

  if (isPending) {
    return <ListSkeleton />;
  }
  if (!data?.length) {
    return (
      <p className="px-2 py-6 text-center text-muted-foreground">
        No chats yet. Open a friend to start one.
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {data.map((c) => {
        const active = params.conversationId === c.id;
        const highlight = c.unread > 0 && !c.muted;
        return (
          <li key={c.id}>
            <Link
              href={`/chat/${c.id}`}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60",
                active && "bg-muted",
              )}
            >
              {c.type === "group" ? (
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UsersIcon className="size-4 text-muted-foreground" />
                </span>
              ) : (
                <UserAvatar
                  name={c.title}
                  online={!!c.peerId && online.has(c.peerId)}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={cn("truncate", highlight && "font-medium")}>
                    {c.title}
                  </span>
                  {c.muted && (
                    <BellOffIcon
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-label="Muted"
                    />
                  )}
                  {c.lastMessageAt && (
                    <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                      {shortTime(c.lastMessageAt)}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "truncate text-xs",
                      highlight ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {c.lastMessagePreview
                      ? `${c.lastMessageSenderId === me.id ? "You: " : ""}${c.lastMessagePreview}`
                      : "No messages yet"}
                  </span>
                  {c.mentioned && (
                    <span className="ml-auto rounded-full bg-online px-1.5 font-medium text-[0.65rem] text-background">
                      @
                    </span>
                  )}
                  {c.unread > 0 && (
                    <span
                      className={cn(
                        "min-w-4 rounded-full px-1.5 text-center font-medium text-[0.65rem] tabular-nums",
                        !c.mentioned && "ml-auto",
                        c.muted
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-3 p-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}
