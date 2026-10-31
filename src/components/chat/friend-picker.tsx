"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { Friend } from "@/lib/chat-types";
import { UserAvatar } from "./user-avatar";

export function FriendPicker({
  friends,
  selected,
  onChange,
}: {
  friends: Friend[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (friends.length === 0) {
    return (
      <p className="py-4 text-center text-muted-foreground">
        No friends to add.
      </p>
    );
  }
  return (
    <ul className="max-h-64 space-y-0.5 overflow-y-auto">
      {friends.map((f) => {
        const id = `pick-${f.userId}`;
        return (
          <li key={f.userId}>
            <label
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60"
            >
              <Checkbox
                id={id}
                checked={selected.has(f.userId)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked === true) {
                    next.add(f.userId);
                  } else {
                    next.delete(f.userId);
                  }
                  onChange(next);
                }}
              />
              <UserAvatar name={f.username} online={f.online} size="sm" />
              <span className="truncate">{f.username}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
