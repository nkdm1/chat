"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFriends } from "@/hooks/chat-queries";
import { AddFriend } from "./add-friend";
import { ConversationList } from "./conversation-list";
import { FriendCodeCard } from "./friend-code";
import { FriendList } from "./friend-list";
import { FriendRequests } from "./friend-requests";
import { NewGroupDialog } from "./new-group-dialog";
import { useRealtime } from "./realtime-provider";

export function Sidebar() {
  const [groupOpen, setGroupOpen] = useState(false);
  const { connected } = useRealtime();
  const { data } = useFriends();
  const incoming = data?.incoming.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b p-3">
        <FriendCodeCard />
        <AddFriend />
        <FriendRequests />
      </div>
      <Tabs defaultValue="chats" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <TabsList className="flex-1">
            <TabsTrigger value="chats">Chats</TabsTrigger>
            <TabsTrigger value="friends">
              Friends
              {incoming > 0 && (
                <span
                  className="size-1.5 rounded-full bg-online"
                  aria-label="New requests"
                />
              )}
            </TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="icon"
            aria-label="New group"
            title="New group"
            onClick={() => setGroupOpen(true)}
          >
            <PlusIcon />
          </Button>
        </div>
        <TabsContent
          value="chats"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        >
          <ConversationList />
        </TabsContent>
        <TabsContent
          value="friends"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        >
          <FriendList />
        </TabsContent>
      </Tabs>
      {!connected && (
        <p
          className="border-t px-3 py-2 text-muted-foreground text-xs"
          role="status"
        >
          Reconnecting… updates may be delayed.
        </p>
      )}
      <NewGroupDialog open={groupOpen} onOpenChange={setGroupOpen} />
    </div>
  );
}
