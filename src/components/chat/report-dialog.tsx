"use client";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import type { Message } from "@/lib/chat-types";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
] as const;

export function ReportDialog({
  message,
  onClose,
  onSubmit,
}: {
  message: Message | null;
  onClose: () => void;
  onSubmit: (
    message: Message,
    reason: string,
    details: string,
  ) => Promise<void>;
}) {
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  function close() {
    onClose();
    setState("idle");
    setDetails("");
    setFormError(null);
  }

  async function submit() {
    if (!message) {
      return;
    }
    setState("sending");
    setFormError(null);
    try {
      await onSubmit(message, reason, details.trim());
      setState("sent");
    } catch (error) {
      setFormError(errorMessage(error));
      setState("idle");
    }
  }

  return (
    <Dialog open={!!message} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Report message</DialogTitle>
          <DialogDescription>
            {state === "sent"
              ? "Thanks. A moderator will review it."
              : "Moderators see this message and your reason, nothing else from the chat."}
          </DialogDescription>
        </DialogHeader>
        {state === "sent" ? (
          <DialogFooter>
            <Button onClick={close}>Done</Button>
          </DialogFooter>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <FormAlert>{formError}</FormAlert>
            <blockquote className="line-clamp-3 rounded-lg bg-muted px-3 py-2 text-sm">
              {message?.body || "Attachment"}
            </blockquote>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 font-medium text-sm">Reason</legend>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-foreground"
                  />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="report-details">Details (optional)</Label>
              <Textarea
                id="report-details"
                value={details}
                maxLength={500}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={state === "sending"}>
                {state === "sending" && <Spinner />}
                Report
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
