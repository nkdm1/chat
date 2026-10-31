"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import type { Message } from "@/lib/chat-types";
import { shortTime } from "@/lib/format";

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function SearchPanel({
  conversationId,
  onPick,
  onClose,
}: {
  conversationId: string;
  onPick: (m: Message) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const { data, isFetching, error } = useQuery({
    queryKey: ["search", conversationId, query],
    queryFn: async () =>
      await api.get<{ results: Message[] }>(
        `/api/conversations/${conversationId}/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.length >= 2,
    retry: false,
  });

  return (
    <div className="animate-enter border-b bg-background">
      <div className="flex items-center gap-2 px-3 py-2">
        <SearchIcon className="size-4 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Search this conversation"
          aria-label="Search messages"
          maxLength={100}
          className="h-8 border-0 shadow-none focus-visible:ring-0"
        />
        {isFetching && <Spinner />}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close search"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      {query.length >= 2 && (
        <ul className="max-h-64 overflow-y-auto border-t py-1">
          {error && (
            <li className="px-4 py-2 text-destructive text-sm">
              {errorMessage(error)}
            </li>
          )}
          {data?.results.length === 0 && (
            <li className="px-4 py-2 text-muted-foreground text-sm">
              No matches.
            </li>
          )}
          {data?.results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full px-4 py-1.5 text-left hover:bg-muted/60"
                onClick={() => onPick(m)}
              >
                <span className="flex justify-between text-muted-foreground text-xs">
                  <span>{m.senderName}</span>
                  <span>{shortTime(m.createdAt)}</span>
                </span>
                <span className="line-clamp-2 text-sm">{m.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
