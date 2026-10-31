"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  BellIcon,
  BellOffIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { keys, useFriends } from "@/hooks/chat-queries";
import { api } from "@/lib/api";
import type { ConversationDetails } from "@/lib/chat-types";
import { GroupSettingsDialog } from "./group-settings-dialog";
import { UserAvatar } from "./user-avatar";

const MUTE_OPTIONS = [
  { label: "For 1 hour", value: 1 },
  { label: "For 8 hours", value: 8 },
  { label: "For 24 hours", value: 24 },
  { label: "Until I turn it back on", value: "forever" },
] as const;

function MuteMenu({ details }: { details: ConversationDetails }) {
  const qc = useQueryClient();
  const mute = useMutation({
    mutationFn: async (mutedFor: number | "forever" | null) =>
      await api.patch(`/api/conversations/${details.id}/membership`, {
        mutedFor,
      }),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: keys.conversation(details.id) });
      await qc.invalidateQueries({ queryKey: keys.conversations });
    },
  });
  if (details.muted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Unmute"
        title="Muted. Click to unmute"
        onClick={() => mute.mutate(null)}
      >
        <BellOffIcon />
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mute notifications">
          <BellIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Mute notifications
        </DropdownMenuLabel>
        {MUTE_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.label} onSelect={() => mute.mutate(o.value)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function headerSubtitle(details: ConversationDetails, online: boolean) {
  if (details.type === "group") {
    return `${details.members.length} members`;
  }
  if (!details.canSend) {
    return "not friends anymore";
  }
  return online ? "online" : "offline";
}

export function ConversationHeader({
  details,
  onSearch,
}: {
  details: ConversationDetails;
  onSearch: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: friends } = useFriends();
  const isGroup = details.type === "group";
  const online =
    !isGroup &&
    friends?.friends.some((f) => f.userId === details.peerId && f.online);
  const subtitle = headerSubtitle(details, !!online);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Back to chats"
        asChild
      >
        <Link href="/chat">
          <ArrowLeftIcon />
        </Link>
      </Button>
      {isGroup ? (
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted">
          <UsersIcon className="size-4 text-muted-foreground" />
        </span>
      ) : (
        <UserAvatar name={details.title} online={!!online} />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-medium">{details.title}</p>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search messages"
        onClick={onSearch}
      >
        <SearchIcon />
      </Button>
      <MuteMenu details={details} />
      {isGroup && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Group settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </Button>
          <GroupSettingsDialog
            key={details.title}
            details={details}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
        </>
      )}
    </header>
  );
}
