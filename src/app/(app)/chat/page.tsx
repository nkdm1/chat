import { MessageCircleIcon } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <div className="flex flex-1 animate-enter flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-muted">
        <MessageCircleIcon className="size-5 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">Pick a conversation</p>
        <p className="max-w-xs text-muted-foreground">
          Share your friend code, or open a friend from the list to start
          chatting.
        </p>
      </div>
    </div>
  );
}
