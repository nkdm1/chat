"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSignOut } from "@/components/logout-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationPrefs } from "@/lib/notifications";
import { readPrefs, writePrefs } from "@/lib/notifications";

function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    sound: true,
    desktop: false,
  });
  useEffect(() => setPrefs(readPrefs()), []);
  const update = (next: NotificationPrefs) => {
    setPrefs(next);
    writePrefs(next);
  };
  return [prefs, update] as const;
}

export function UserMenu({
  username,
  email,
  isAdmin,
}: {
  username: string;
  email: string;
  isAdmin: boolean;
}) {
  const signOut = useSignOut();
  const [prefs, setPrefs] = useNotificationPrefs();

  async function toggleDesktop(enabled: boolean) {
    if (
      enabled &&
      "Notification" in window &&
      Notification.permission !== "granted"
    ) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return;
      }
    }
    setPrefs({ ...prefs, desktop: enabled });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-offset-2 transition-opacity hover:opacity-80"
      >
        <Avatar>
          <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{username}</div>
          <div className="text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/chat">Chat</Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">Admin</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings/security">Security</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Notifications
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={prefs.sound}
          onCheckedChange={(checked) => setPrefs({ ...prefs, sound: checked })}
          onSelect={(e) => e.preventDefault()}
        >
          Sound
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.desktop}
          onCheckedChange={(checked) => {
            void toggleDesktop(checked);
          }}
          onSelect={(e) => e.preventDefault()}
        >
          Desktop notifications
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
