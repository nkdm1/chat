import type { ReactNode } from "react";
import { ChatShell } from "@/components/chat/chat-shell";
import { RealtimeProvider } from "@/components/chat/realtime-provider";
import { requireSession } from "@/lib/session";

export default async function ChatLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await requireSession();
  const me = {
    id: user.id,
    username: user.username,
    role: user.role ?? "user",
  };
  return (
    <RealtimeProvider me={me}>
      <ChatShell>{children}</ChatShell>
    </RealtimeProvider>
  );
}
