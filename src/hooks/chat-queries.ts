"use client";

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ConversationDetails,
  ConversationSummary,
  FriendsList,
  Message,
  MessagePage,
} from "@/lib/chat-types";

export const keys = {
  friendCode: ["friend-code"] as const,
  friends: ["friends"] as const,
  conversations: ["conversations"] as const,
  conversation: (id: string) => ["conversation", id] as const,
  messages: (id: string) => ["messages", id] as const,
  around: (id: string, sortKey: string) =>
    ["messages", id, "around", sortKey] as const,
};

const PAGE = 30;

export function pollWhile(disconnected: boolean) {
  return disconnected ? 15_000 : false;
}

export function useFriendCode() {
  return useQuery({
    queryKey: keys.friendCode,
    queryFn: async () => await api.get<{ code: string }>("/api/me/friend-code"),
  });
}

export function useFriends(disconnected = false) {
  return useQuery({
    queryKey: keys.friends,
    queryFn: async () => await api.get<FriendsList>("/api/friends"),
    // Presence expires silently on the server; refresh it now and then.
    refetchInterval: disconnected ? 15_000 : 60_000,
  });
}

export function useConversations(disconnected = false) {
  return useQuery({
    queryKey: keys.conversations,
    queryFn: async () =>
      await api.get<ConversationSummary[]>("/api/conversations"),
    refetchInterval: pollWhile(disconnected),
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: keys.conversation(id),
    queryFn: async () =>
      await api.get<ConversationDetails>(`/api/conversations/${id}`),
    retry: false,
  });
}

export function useMessages(id: string, disconnected = false) {
  return useInfiniteQuery({
    queryKey: keys.messages(id),
    queryFn: async ({ pageParam }) =>
      await api.get<MessagePage>(
        `/api/conversations/${id}/messages?limit=${PAGE}${
          pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""
        }`,
      ),
    initialPageParam: "",
    getNextPageParam: (last) =>
      last.hasMore ? last.messages[0]?.sortKey : undefined,
    refetchInterval: pollWhile(disconnected),
    retry: false,
  });
}

export function useMessagesAround(id: string, sortKey: string | null) {
  return useQuery({
    queryKey: keys.around(id, sortKey ?? ""),
    queryFn: async () =>
      await api.get<MessagePage>(
        `/api/conversations/${id}/messages?limit=40&around=${encodeURIComponent(sortKey ?? "")}`,
      ),
    enabled: !!sortKey,
  });
}

type Pages = InfiniteData<MessagePage>;

/** Pages are newest-first; each page is oldest-first. */
export function flattenPages(data: Pages | undefined): Message[] {
  return data ? data.pages.toReversed().flatMap((p) => p.messages) : [];
}

function mapMessages(
  qc: QueryClient,
  conversationId: string,
  fn: (m: Message[]) => Message[],
) {
  qc.setQueryData<Pages>(keys.messages(conversationId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({ ...p, messages: fn(p.messages) })),
        }
      : data,
  );
}

/** Adds or replaces a message (matched by id), keeping order by sortKey. */
export function upsertMessage(qc: QueryClient, message: Message) {
  qc.setQueryData<Pages>(keys.messages(message.conversationId), (data) => {
    if (!data) {
      return data;
    }
    const exists = data.pages.some((p) =>
      p.messages.some((m) => m.id === message.id),
    );
    if (exists) {
      return {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          messages: p.messages.map((m) => (m.id === message.id ? message : m)),
        })),
      };
    }
    const [newest, ...rest] = data.pages;
    const messages = [...(newest?.messages ?? []), message].toSorted((a, b) =>
      a.sortKey.localeCompare(b.sortKey),
    );
    const page = newest
      ? { ...newest, messages }
      : { hasMore: false, hasNewer: false, messages };
    return { ...data, pages: [page, ...rest] };
  });
}

export function patchMessage(
  qc: QueryClient,
  conversationId: string,
  id: string,
  patch: Partial<Message>,
) {
  mapMessages(qc, conversationId, (list) =>
    list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  );
}

export function removeMessage(
  qc: QueryClient,
  conversationId: string,
  id: string,
) {
  mapMessages(qc, conversationId, (list) => list.filter((m) => m.id !== id));
}

/** Same deterministic id the server derives, so optimistic and real messages match. */
export async function messageIdFor(senderId: string, clientMessageId: string) {
  const bytes = new TextEncoder().encode(`${senderId}:${clientMessageId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
