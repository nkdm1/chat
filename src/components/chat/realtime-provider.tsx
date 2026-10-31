"use client";

import { WebPubSubClient } from "@azure/web-pubsub-client";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  keys,
  patchMessage,
  upsertMessage,
  useConversations,
} from "@/hooks/chat-queries";
import { api } from "@/lib/api";
import type {
  ConversationDetails,
  ConversationSummary,
  FriendsList,
  Me,
  Message,
  Reaction,
} from "@/lib/chat-types";
import { notify, unlockAudioOnGesture } from "@/lib/notifications";

type Typist = { userId: string; username: string; until: number };

type Realtime = {
  me: Me;
  connected: boolean;
  typing: Record<string, Typist[]>;
  activeConversation: string | null;
  setActiveConversation: (id: string | null) => void;
};

const RealtimeContext = createContext<Realtime | null>(null);

export function useRealtime() {
  const value = use(RealtimeContext);
  if (!value) {
    throw new Error("useRealtime must be used inside <RealtimeProvider>");
  }
  return value;
}

const TYPING_MS = 10_000;
const HEARTBEAT_MS = 30_000;

type ServerEvent =
  | {
      type: "message.created" | "message.updated";
      conversationId: string;
      message: Message;
    }
  | { type: "message.deleted"; conversationId: string; messageId: string }
  | {
      type: "message.reactions";
      conversationId: string;
      messageId: string;
      reactions: Reaction[];
    }
  | { type: "typing"; conversationId: string; userId: string; username: string }
  | {
      type: "conversation.read";
      conversationId: string;
      userId: string;
      lastReadAt: string;
    }
  | { type: "conversation.updated"; conversationId: string }
  | { type: "conversation.member.added"; conversationId: string }
  | {
      type: "conversation.member.removed";
      conversationId: string;
      userId: string;
    }
  | { type: "friend.request" | "friend.accepted" | "friend.removed" }
  | { type: "presence"; userId: string; online: boolean };

function isServerEvent(value: unknown): value is ServerEvent {
  return typeof value === "object" && value !== null && "type" in value;
}

type Handlers = {
  qc: QueryClient;
  me: Me;
  onTyping: (event: {
    conversationId: string;
    userId: string;
    username: string;
  }) => void;
  onStopTyping: (conversationId: string, userId: string) => void;
  onRemoved: (conversationId: string) => void;
};

function onMessageCreated({ qc, me }: Handlers, message: Message) {
  upsertMessage(qc, message);
  void qc.invalidateQueries({ queryKey: keys.conversations });
  if (message.senderId === me.id) {
    return;
  }
  const summary = qc
    .getQueryData<ConversationSummary[]>(keys.conversations)
    ?.find((c) => c.id === message.conversationId);
  const mentioned = message.mentions.includes(me.id);
  if (mentioned || !summary?.muted) {
    notify({
      title:
        summary?.type === "group"
          ? `${message.senderName} in ${summary.title}`
          : message.senderName,
      body: message.body || "Sent an attachment",
      url: `/chat/${message.conversationId}`,
    });
  }
}

function markReadBy(
  qc: QueryClient,
  event: { conversationId: string; userId: string; lastReadAt: string },
) {
  qc.setQueryData<ConversationDetails>(
    keys.conversation(event.conversationId),
    (d) =>
      d && {
        ...d,
        members: d.members.map((m) =>
          m.userId === event.userId
            ? { ...m, lastReadAt: event.lastReadAt }
            : m,
        ),
      },
  );
}

function setPresence(
  qc: QueryClient,
  event: { userId: string; online: boolean },
) {
  qc.setQueryData<FriendsList>(
    keys.friends,
    (d) =>
      d && {
        ...d,
        friends: d.friends.map((f) =>
          f.userId === event.userId ? { ...f, online: event.online } : f,
        ),
      },
  );
}

function refreshConversation(qc: QueryClient, conversationId: string) {
  void qc.invalidateQueries({ queryKey: keys.conversations });
  void qc.invalidateQueries({ queryKey: keys.conversation(conversationId) });
}

const DELETED = { body: "", attachments: [], reactions: [] };

function handle(h: Handlers, event: ServerEvent) {
  const { qc } = h;
  switch (event.type) {
    case "message.created":
      h.onStopTyping(event.message.conversationId, event.message.senderId);
      onMessageCreated(h, event.message);
      break;
    case "message.updated":
      upsertMessage(qc, event.message);
      break;
    case "message.deleted":
      patchMessage(qc, event.conversationId, event.messageId, {
        ...DELETED,
        deletedAt: new Date().toISOString(),
      });
      break;
    case "message.reactions":
      patchMessage(qc, event.conversationId, event.messageId, {
        reactions: event.reactions,
      });
      break;
    case "typing":
      h.onTyping(event);
      break;
    case "conversation.read":
      markReadBy(qc, event);
      break;
    case "conversation.member.removed":
      if (event.userId === h.me.id) {
        h.onRemoved(event.conversationId);
      }
      refreshConversation(qc, event.conversationId);
      break;
    case "conversation.updated":
    case "conversation.member.added":
      refreshConversation(qc, event.conversationId);
      break;
    case "presence":
      setPresence(qc, event);
      break;
    case "friend.request":
    case "friend.accepted":
    case "friend.removed":
      void qc.invalidateQueries({ queryKey: keys.friends });
      void qc.invalidateQueries({ queryKey: keys.conversations });
      break;
    default:
      break;
  }
}

function useHeartbeat() {
  useEffect(() => {
    const beat = () => {
      if (!document.hidden) {
        void api.post("/api/presence/heartbeat").catch(() => undefined);
      }
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
}

/** "(3) chat" in the tab title while there are unread messages. */
function useUnreadTitle(connected: boolean) {
  const { data } = useConversations(!connected);
  const unread =
    data?.reduce((n, c) => n + (c.muted && !c.mentioned ? 0 : c.unread), 0) ??
    0;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = unread ? `(${unread}) ${base}` : base;
  }, [unread]);
}

export function RealtimeProvider({
  me,
  children,
}: {
  me: Me;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  // Optimistic until the first failure, so the "Reconnecting" notice doesn't
  // flash on every page load.
  const [connected, setConnected] = useState(true);
  const [typing, setTyping] = useState<Record<string, Typist[]>>({});
  const [activeConversation, setActiveConversation] = useState<string | null>(
    null,
  );
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeConversation;

  useHeartbeat();
  useEffect(unlockAudioOnGesture, []);
  useUnreadTitle(connected);

  useEffect(() => {
    const client = new WebPubSubClient({
      getClientAccessUrl: async () => {
        const { url } = await api.post<{ url: string }>("/api/negotiate");
        return url;
      },
    });
    const handlers: Handlers = {
      qc,
      me,
      onTyping: ({ conversationId, userId, username }) =>
        setTyping((prev) => ({
          ...prev,
          [conversationId]: [
            ...(prev[conversationId] ?? []).filter((t) => t.userId !== userId),
            { userId, username, until: Date.now() + TYPING_MS },
          ],
        })),
      onStopTyping: (conversationId, userId) =>
        setTyping((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).filter(
            (t) => t.userId !== userId,
          ),
        })),
      onRemoved: (conversationId) => {
        if (activeRef.current === conversationId) {
          router.push("/chat");
        }
      },
    };
    client.on("connected", () => {
      setConnected(true);
      // Catch up on anything missed while disconnected.
      void qc.invalidateQueries();
    });
    client.on("disconnected", () => setConnected(false));
    client.on("stopped", () => setConnected(false));
    client.on("server-message", ({ message }) => {
      if (isServerEvent(message.data)) {
        handle(handlers, message.data);
      }
    });
    // stop() is ignored while start() is still connecting, so a client
    // cleaned up mid-connect is stopped once it finishes.
    let disposed = false;
    client
      .start()
      .then(() => {
        if (disposed) {
          client.stop();
        }
      })
      .catch(() => {
        if (!disposed) {
          setConnected(false);
        }
      });
    return () => {
      disposed = true;
      client.stop();
    };
  }, [qc, me, router]);

  // Drop expired typing indicators.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev)
            .map(
              ([id, list]) => [id, list.filter((t) => t.until > now)] as const,
            )
            .filter(([, list]) => list.length > 0),
        );
        return Object.keys(next).length === Object.keys(prev).length &&
          Object.values(prev).every(
            (l, i) => l.length === Object.values(next)[i]?.length,
          )
          ? prev
          : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const value = useMemo(
    () => ({
      me,
      connected,
      typing,
      activeConversation,
      setActiveConversation,
    }),
    [me, connected, typing, activeConversation],
  );
  return <RealtimeContext value={value}>{children}</RealtimeContext>;
}
