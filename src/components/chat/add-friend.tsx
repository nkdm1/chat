"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { keys } from "@/hooks/chat-queries";
import { api, errorMessage } from "@/lib/api";

type Result = { status: "sent" | "accepted"; user: { username: string } };

export function AddFriend() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const send = useMutation({
    mutationFn: async (value: string) =>
      await api.post<Result>("/api/friends/requests", { code: value }),
    onSuccess: (res) => {
      setCode("");
      setFeedback({
        ok: true,
        text:
          res.status === "accepted"
            ? `You and ${res.user.username} are now friends.`
            : `Request sent to ${res.user.username}.`,
      });
      void qc.invalidateQueries({ queryKey: keys.friends });
    },
    onError: (error) => setFeedback({ ok: false, text: errorMessage(error) }),
  });
  const digits = code.replaceAll(/\D/g, "");

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        setFeedback(null);
        send.mutate(digits);
      }}
    >
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replaceAll(/[^\d ]/g, "").slice(0, 7))
          }
          inputMode="numeric"
          autoComplete="off"
          placeholder="Friend code"
          aria-label="Friend code"
          className="font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal"
        />
        <Button
          type="submit"
          disabled={digits.length !== 6 || send.isPending}
          aria-label="Send friend request"
        >
          {send.isPending ? <Spinner /> : <UserPlusIcon />}
        </Button>
      </div>
      {feedback && (
        <p
          role={feedback.ok ? "status" : "alert"}
          className={`animate-enter text-xs ${feedback.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {feedback.text}
        </p>
      )}
    </form>
  );
}
