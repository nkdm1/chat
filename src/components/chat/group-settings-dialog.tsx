"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/confirm-dialog";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { keys, useFriends } from "@/hooks/chat-queries";
import { api, errorMessage } from "@/lib/api";
import type { ConversationDetails } from "@/lib/chat-types";
import { FriendPicker } from "./friend-picker";
import { useRealtime } from "./realtime-provider";
import { UserAvatar } from "./user-avatar";

type Props = {
  details: ConversationDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function useGroupMutations(
  details: ConversationDetails,
  onError: (msg: string) => void,
) {
  const qc = useQueryClient();
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: keys.conversation(details.id) });
    await qc.invalidateQueries({ queryKey: keys.conversations });
  };
  const options = {
    onSettled: refresh,
    onError: (e: Error) => onError(errorMessage(e)),
  };
  const base = `/api/conversations/${details.id}`;
  return {
    rename: useMutation({
      mutationFn: async (name: string) => await api.patch(base, { name }),
      ...options,
    }),
    add: useMutation({
      mutationFn: async (userIds: string[]) =>
        await api.post(`${base}/members`, { userIds }),
      ...options,
    }),
    remove: useMutation({
      mutationFn: async (userId: string) =>
        await api.delete(`${base}/members/${userId}`),
      ...options,
    }),
  };
}

export function GroupSettingsDialog({ details, open, onOpenChange }: Props) {
  const router = useRouter();
  const { me } = useRealtime();
  const confirm = useConfirm();
  const { data: friends } = useFriends();
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState(details.title);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const m = useGroupMutations(details, setFormError);
  const owner = details.role === "owner";
  const memberIds = new Set(details.members.map((x) => x.userId));
  const addable =
    friends?.friends.filter((f) => !memberIds.has(f.userId)) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Group settings</DialogTitle>
          <DialogDescription>
            {details.members.length} members
          </DialogDescription>
        </DialogHeader>
        <FormAlert>{formError}</FormAlert>
        {owner && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              m.rename.mutate(name);
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              aria-label="Group name"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!name.trim() || name === details.title}
            >
              Rename
            </Button>
          </form>
        )}
        <ul className="max-h-56 space-y-0.5 overflow-y-auto">
          {details.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
            >
              <UserAvatar name={member.username} size="sm" />
              <span className="flex-1 truncate">
                {member.username}
                {member.userId === me.id && (
                  <span className="text-muted-foreground"> (you)</span>
                )}
              </span>
              {member.role === "owner" && (
                <span className="text-muted-foreground text-xs">owner</span>
              )}
              {owner && member.userId !== me.id && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => m.remove.mutate(member.userId)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        {owner && addable.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="font-medium text-sm">Add friends</p>
              <FriendPicker
                friends={addable}
                selected={selected}
                onChange={setSelected}
              />
              <Button
                size="sm"
                disabled={selected.size === 0}
                onClick={() =>
                  m.add.mutate([...selected], {
                    onSuccess: () => setSelected(new Set()),
                  })
                }
              >
                Add {selected.size || ""}
              </Button>
            </div>
          </>
        )}
        <Separator />
        <Button
          variant="destructive"
          onClick={async () => {
            const ok = await confirm({
              title: "Leave this group?",
              description:
                "You won't see new messages unless someone adds you back.",
              action: "Leave",
              destructive: true,
            });
            if (ok) {
              m.remove.mutate(me.id, { onSuccess: () => router.push("/chat") });
            }
          }}
        >
          Leave group
        </Button>
      </DialogContent>
    </Dialog>
  );
}
