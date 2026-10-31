"use client";

import { ArrowDownIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import type { ConversationDetails, Member, Message } from "@/lib/chat-types";
import type { MessageHandlers } from "./message-item";
import { MessageItem } from "./message-item";
import { useRealtime } from "./realtime-provider";

const NEAR_BOTTOM_PX = 120;

/** For each other member, the newest message they've read (by time). */
function seenMap(messages: Message[], members: Member[], meId: string) {
  const seen = new Map<string, Member[]>();
  for (const member of members) {
    if (member.userId === meId || !member.lastReadAt) {
      continue;
    }
    const readAt = member.lastReadAt;
    const last = messages.findLast((m) => !m.pending && m.createdAt <= readAt);
    if (last) {
      seen.set(last.id, [...(seen.get(last.id) ?? []), member]);
    }
  }
  return seen;
}

function TypingLine({ conversationId }: { conversationId: string }) {
  const { typing } = useRealtime();
  const people = typing[conversationId] ?? [];
  if (people.length === 0) {
    return null;
  }
  const names = people.map((p) => p.username);
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} are typing`;
  return (
    <p
      className="flex animate-enter items-center gap-1.5 px-2 text-muted-foreground text-xs"
      aria-live="polite"
    >
      <span className="flex gap-0.5" aria-hidden>
        <span className="size-1 animate-pulse-soft rounded-full bg-muted-foreground" />
        <span className="size-1 animate-pulse-soft rounded-full bg-muted-foreground [animation-delay:200ms]" />
        <span className="size-1 animate-pulse-soft rounded-full bg-muted-foreground [animation-delay:400ms]" />
      </span>
      {label}…
    </p>
  );
}

type Props = {
  messages: Message[];
  details: ConversationDetails;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onAtBottomChange: (atBottom: boolean) => void;
  highlightId: string | null;
  handlers: MessageHandlers;
  jumped: boolean;
  onBackToLatest: () => void;
};

/** Keeps the view pinned to the bottom for new messages, and stable when older ones load. */
function useScrollAnchoring(
  messages: Message[],
  meId: string,
  onAtBottomChange: (b: boolean) => void,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prev = useRef({ first: "", last: "", height: 0 });
  const [showJump, setShowJump] = useState(false);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    const first = messages[0]?.id ?? "";
    const last = messages.at(-1);
    const before = prev.current;
    if (before.first && first !== before.first && last?.id === before.last) {
      el.scrollTop += el.scrollHeight - before.height; // older page prepended
    } else if (
      last &&
      last.id !== before.last &&
      (atBottom.current || last.senderId === meId || !before.last)
    ) {
      el.scrollTop = el.scrollHeight;
    }
    prev.current = { first, last: last?.id ?? "", height: el.scrollHeight };
  }, [messages, meId]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    const bottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (bottom !== atBottom.current) {
      atBottom.current = bottom;
      onAtBottomChange(bottom);
    }
    setShowJump(!bottom);
  };

  const toBottom = () =>
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  return { scroller, onScroll, showJump, toBottom };
}

export function MessageList(props: Props) {
  const { messages, details, handlers, hasOlder, loadingOlder, onLoadOlder } =
    props;
  const { me } = useRealtime();
  const { scroller, onScroll, showJump, toBottom } = useScrollAnchoring(
    messages,
    me.id,
    props.onAtBottomChange,
  );
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasOlder) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !loadingOlder) {
        onLoadOlder();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasOlder, loadingOlder, onLoadOlder]);

  const derived = useMemo(() => {
    const usernames = new Set(details.members.map((m) => m.username));
    const names = new Map(details.members.map((m) => [m.userId, m.username]));
    for (const m of messages) {
      names.set(m.senderId, m.senderName);
    }
    return {
      usernames,
      names,
      seen: seenMap(messages, details.members, me.id),
    };
  }, [details.members, messages, me.id]);
  const isGroup = details.type === "group";
  const canModerate = isGroup && details.role === "owner";

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex h-full flex-col overflow-y-auto px-3 py-4 sm:px-6"
      >
        <div className="flex-1" />
        <div ref={sentinel} className="flex h-6 shrink-0 justify-center">
          {loadingOlder && <Spinner />}
        </div>
        {!hasOlder && messages.length > 0 && (
          <p className="pb-4 text-center text-muted-foreground text-xs">
            This is the start of the conversation.
          </p>
        )}
        {messages.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">
            No messages yet. Say hi 👋
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          {messages.map((m, i) => (
            <MessageItem
              key={m.id}
              message={m}
              mine={m.senderId === me.id}
              meId={me.id}
              showSender={isGroup && messages[i - 1]?.senderId !== m.senderId}
              canModerate={canModerate}
              highlighted={props.highlightId === m.id}
              seenBy={derived.seen.get(m.id) ?? []}
              isDirect={!isGroup}
              usernames={derived.usernames}
              names={derived.names}
              handlers={handlers}
            />
          ))}
        </div>
        <div className="h-5 pt-1">
          <TypingLine conversationId={details.id} />
        </div>
      </div>
      {(showJump || props.jumped) && (
        <Button
          variant="outline"
          size="sm"
          className="absolute right-4 bottom-3 shadow-sm"
          onClick={props.jumped ? props.onBackToLatest : toBottom}
        >
          <ArrowDownIcon /> {props.jumped ? "Back to latest" : "Latest"}
        </Button>
      )}
    </div>
  );
}
