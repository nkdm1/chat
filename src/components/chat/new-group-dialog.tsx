"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { keys, useFriends } from "@/hooks/chat-queries";
import { api, errorMessage } from "@/lib/api";
import { groupNameSchema } from "@/lib/validation";
import { FriendPicker } from "./friend-picker";

export function NewGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useFriends();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () =>
      await api.post<{ id: string }>("/api/conversations", {
        name,
        memberIds: [...selected],
      }),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: keys.conversations });
      onOpenChange(false);
      setName("");
      setSelected(new Set());
      router.push(`/chat/${id}`);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  function submit() {
    const parsed = groupNameSchema.safeParse(name);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    if (selected.size === 0) {
      setFormError("Pick at least one friend.");
      return;
    }
    setFormError(null);
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Groups can include your friends.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormAlert>{formError}</FormAlert>
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-sm">Members</p>
            <FriendPicker
              friends={data?.friends ?? []}
              selected={selected}
              onChange={setSelected}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner />}
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
