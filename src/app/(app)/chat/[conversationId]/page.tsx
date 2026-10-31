import type { Metadata } from "next";
import { ConversationView } from "@/components/chat/conversation-view";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({
  params,
}: PageProps<"/chat/[conversationId]">) {
  const { conversationId } = await params;
  return (
    <ConversationView key={conversationId} conversationId={conversationId} />
  );
}
