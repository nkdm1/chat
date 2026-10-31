"use client";

import { cn } from "cn";
import Link from "next/link";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  flattenPages,
  useConversation,
  useConversations,
  useMessages,
  useMessagesAround,
} from "@/hooks/chat-queries";
import type { MessageActions } from "@/hooks/use-message-actions";
import { useMessageActions } from "@/hooks/use-message-actions";
import type {
  AttachmentRef,
  ConversationDetails,
  Message,
} from "@/lib/chat-types";
import type { ComposerHandle, ComposerMode } from "./composer";
import { Composer } from "./composer";
import { ConversationHeader } from "./conversation-header";
import { Lightbox } from "./lightbox";
import type { MessageHandlers } from "./message-item";
import { MessageList } from "./message-list";
import { useRealtime } from "./realtime-provider";
import { ReportDialog } from "./report-dialog";
import { SearchPanel } from "./search-panel";

const HIGHLIGHT_MS = 2000;

function useWindowFocused() {
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const update = () => setFocused(document.hasFocus() && !document.hidden);
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return focused;
}

/** Marks the conversation read while it's visible, focused and scrolled to the bottom. */
function useMarkRead(
  conversationId: string,
  atBottom: boolean,
  markRead: () => Promise<void>,
) {
  const { connected } = useRealtime();
  const { data } = useConversations(!connected);
  const summary = data?.find((c) => c.id === conversationId);
  const pending = !!summary && (summary.unread > 0 || summary.mentioned);
  const focused = useWindowFocused();

  useEffect(() => {
    if (!pending || !atBottom || !focused) {
      return;
    }
    const timer = setTimeout(() => {
      void markRead();
    }, 400);
    return () => clearTimeout(timer);
  }, [pending, atBottom, focused, markRead]);
}

/** Jumping to a message: scroll if it's loaded, otherwise load the page around it. */
function useJump(conversationId: string, latest: Message[]) {
  const [anchor, setAnchor] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const around = useMessagesAround(conversationId, anchor);

  const flash = useCallback((id: string) => {
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), HIGHLIGHT_MS);
    requestAnimationFrame(() =>
      document
        .querySelector(`#message-${id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }, []);

  const messages = useMemo(
    () => (anchor ? (around.data?.messages ?? []) : latest),
    [anchor, around.data, latest],
  );

  const jumpTo = useCallback(
    (target: { id: string; sortKey?: string }) => {
      if (messages.some((m) => m.id === target.id)) {
        flash(target.id);
      } else if (target.sortKey) {
        setAnchor(target.sortKey);
        setHighlight(target.id);
      }
    },
    [messages, flash],
  );

  useEffect(() => {
    if (anchor && around.data && highlight) {
      flash(highlight);
    }
  }, [anchor, around.data, highlight, flash]);

  return {
    anchor,
    messages,
    highlight,
    jumpTo,
    backToLatest: () => setAnchor(null),
  };
}

function useDropZone(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: (e: DragEvent) => {
      const inside =
        e.relatedTarget instanceof Node &&
        e.currentTarget.contains(e.relatedTarget);
      if (!inside) {
        setDragging(false);
      }
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      onFiles([...e.dataTransfer.files]);
    },
  };
}

type HandlerDeps = {
  actions: MessageActions;
  messages: Message[];
  jumpTo: (target: { id: string; sortKey?: string }) => void;
  setMode: (mode: ComposerMode) => void;
  setReporting: (m: Message) => void;
  setImage: (a: AttachmentRef) => void;
};

function useMessageHandlers({
  actions,
  messages,
  jumpTo,
  setMode,
  setReporting,
  setImage,
}: HandlerDeps) {
  const confirm = useConfirm();
  return useMemo<MessageHandlers>(
    () => ({
      onReply: (message) => setMode({ kind: "reply", message }),
      onEdit: (message) => setMode({ kind: "edit", message }),
      onDelete: (message) => {
        void confirm({
          title: "Delete this message?",
          description: "It's removed for everyone.",
          action: "Delete",
          destructive: true,
        }).then(async (ok) => {
          if (ok) {
            await actions.remove(message);
          }
        });
      },
      onReport: setReporting,
      onReact: (message, emoji) => {
        void actions.react(message, emoji);
      },
      onRetry: (message) => {
        void actions.retry(message);
      },
      onJump: (id) =>
        jumpTo({ id, sortKey: messages.find((m) => m.id === id)?.sortKey }),
      onOpenImage: setImage,
    }),
    [actions, confirm, messages, jumpTo, setMode, setReporting, setImage],
  );
}

function ConversationMissing() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-medium">Conversation not found</p>
      <p className="text-muted-foreground">
        It may have been removed, or you&apos;re no longer a member.
      </p>
      <Button variant="outline" asChild>
        <Link href="/chat">Back to chats</Link>
      </Button>
    </div>
  );
}

function ConversationLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6" aria-hidden>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="ml-auto h-10 w-1/2" />
    </div>
  );
}

function Conversation({ details }: { details: ConversationDetails }) {
  const { me, connected } = useRealtime();
  const pages = useMessages(details.id, !connected);
  const actions = useMessageActions(details.id);
  const composer = useRef<ComposerHandle>(null);
  const [mode, setMode] = useState<ComposerMode>(null);
  const [searching, setSearching] = useState(false);
  const [image, setImage] = useState<AttachmentRef | null>(null);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const latest = useMemo(() => flattenPages(pages.data), [pages.data]);
  const jump = useJump(details.id, latest);
  const drop = useDropZone((files) => composer.current?.addFiles(files));
  const handlers = useMessageHandlers({
    actions,
    messages: jump.messages,
    jumpTo: jump.jumpTo,
    setMode,
    setReporting,
    setImage,
  });
  useMarkRead(details.id, atBottom && !jump.anchor, actions.markRead);
  const lastOwnMessage = latest.findLast(
    (m) => m.senderId === me.id && !m.deletedAt && !m.pending && m.body,
  );

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col",
        drop.dragging && "ring-2 ring-online/50 ring-inset",
      )}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      <ConversationHeader
        details={details}
        onSearch={() => setSearching((s) => !s)}
      />
      {searching && (
        <SearchPanel
          conversationId={details.id}
          onClose={() => setSearching(false)}
          onPick={(m) => jump.jumpTo(m)}
        />
      )}
      <MessageList
        messages={jump.messages}
        details={details}
        hasOlder={jump.anchor ? false : !!pages.hasNextPage}
        loadingOlder={pages.isFetchingNextPage}
        onLoadOlder={() => {
          void pages.fetchNextPage();
        }}
        onAtBottomChange={setAtBottom}
        highlightId={jump.highlight}
        handlers={handlers}
        jumped={!!jump.anchor}
        onBackToLatest={jump.backToLatest}
      />
      <Composer
        ref={composer}
        actions={actions}
        members={details.members}
        meId={me.id}
        disabled={!details.canSend}
        mode={mode}
        onModeChange={setMode}
        lastOwnMessage={lastOwnMessage}
      />
      {drop.dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 font-medium">
          Drop files to attach
        </div>
      )}
      <Lightbox image={image} onClose={() => setImage(null)} />
      <ReportDialog
        message={reporting}
        onClose={() => setReporting(null)}
        onSubmit={actions.report}
      />
    </div>
  );
}

export function ConversationView({
  conversationId,
}: {
  conversationId: string;
}) {
  const { setActiveConversation } = useRealtime();
  const details = useConversation(conversationId);

  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  if (details.isError) {
    return <ConversationMissing />;
  }
  if (!details.data) {
    return <ConversationLoading />;
  }
  return (
    <section
      aria-label={`Conversation: ${details.data.title}`}
      className="flex min-w-0 flex-1"
    >
      <Conversation details={details.data} />
    </section>
  );
}
