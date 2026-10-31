"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { useRealtime } from "@/components/chat/realtime-provider";
import { api } from "@/lib/api";
import type {
  AttachmentRef,
  ConversationSummary,
  Me,
  Message,
  Reaction,
} from "@/lib/chat-types";
import {
  keys,
  messageIdFor,
  patchMessage,
  upsertMessage,
} from "./chat-queries";

const TYPING_EVERY_MS = 2500;

export type Draft = {
  body: string;
  attachments: AttachmentRef[];
  replyTo?: Message;
};

async function optimisticMessage(
  me: Me,
  conversationId: string,
  draft: Draft,
): Promise<Message> {
  const clientMessageId = crypto.randomUUID();
  const id = await messageIdFor(me.id, clientMessageId);
  const createdAt = new Date().toISOString();
  return {
    id,
    conversationId,
    senderId: me.id,
    senderName: me.username,
    body: draft.body.trim(),
    attachments: draft.attachments,
    replyTo: draft.replyTo && {
      id: draft.replyTo.id,
      senderId: draft.replyTo.senderId,
      preview: draft.replyTo.body.slice(0, 120) || "Attachment",
    },
    mentions: [],
    reactions: [],
    createdAt,
    sortKey: `${createdAt}_${id}`,
    pending: true,
    clientMessageId,
  };
}

async function deliver(qc: QueryClient, message: Message, draft: Draft) {
  try {
    const saved = await api.post<Message>(
      `/api/conversations/${message.conversationId}/messages`,
      {
        body: draft.body,
        clientMessageId: message.clientMessageId,
        attachmentIds: draft.attachments.map((a) => a.id),
        replyToId: draft.replyTo?.id,
      },
    );
    upsertMessage(qc, saved);
    void qc.invalidateQueries({ queryKey: keys.conversations });
  } catch {
    patchMessage(qc, message.conversationId, message.id, {
      pending: false,
      failed: true,
    });
  }
}

/** Optimistic send. The id is derived like the server does, so retries dedupe. */
function useSending(conversationId: string) {
  const qc = useQueryClient();
  const { me } = useRealtime();
  const send = useCallback(
    async (draft: Draft) => {
      const optimistic = await optimisticMessage(me, conversationId, draft);
      upsertMessage(qc, optimistic);
      await deliver(qc, optimistic, draft);
    },
    [qc, me, conversationId],
  );
  const retry = useCallback(
    async (message: Message) => {
      patchMessage(qc, conversationId, message.id, {
        pending: true,
        failed: false,
      });
      await deliver(qc, message, {
        body: message.body,
        attachments: message.attachments,
      });
    },
    [qc, conversationId],
  );
  return useMemo(() => ({ send, retry }), [send, retry]);
}

function useMessageMutations(conversationId: string) {
  const qc = useQueryClient();
  const edit = useCallback(
    async (message: Message, body: string) => {
      upsertMessage(
        qc,
        await api.patch<Message>(`/api/messages/${message.id}`, {
          conversationId,
          body,
        }),
      );
    },
    [qc, conversationId],
  );
  const remove = useCallback(
    async (message: Message) => {
      await api.delete(
        `/api/messages/${message.id}?conversationId=${conversationId}`,
      );
      patchMessage(qc, conversationId, message.id, {
        body: "",
        attachments: [],
        reactions: [],
        deletedAt: new Date().toISOString(),
      });
    },
    [qc, conversationId],
  );
  const react = useCallback(
    async (message: Message, emoji: string) => {
      const res = await api.post<{ reactions: Reaction[] }>(
        `/api/messages/${message.id}/reactions`,
        {
          conversationId,
          emoji,
        },
      );
      patchMessage(qc, conversationId, message.id, {
        reactions: res.reactions,
      });
    },
    [qc, conversationId],
  );
  const report = useCallback(
    async (message: Message, reason: string, details: string) => {
      await api.post(`/api/messages/${message.id}/report`, {
        conversationId,
        reason,
        details: details || undefined,
      });
    },
    [conversationId],
  );
  return useMemo(
    () => ({ edit, remove, react, report }),
    [edit, remove, react, report],
  );
}

/** Uploads, typing pings and mark-read for the open conversation. */
function useConversationPings(conversationId: string) {
  const qc = useQueryClient();
  const lastTyping = useRef(0);
  const base = `/api/conversations/${conversationId}`;
  const upload = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return await api.post<AttachmentRef>(`${base}/attachments`, form);
    },
    [base],
  );
  const typing = useCallback(() => {
    const now = Date.now();
    if (now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      void api.post(`${base}/typing`).catch(() => undefined);
    }
  }, [base]);
  const markRead = useCallback(async () => {
    qc.setQueryData<ConversationSummary[]>(keys.conversations, (list) =>
      list?.map((c) =>
        c.id === conversationId ? { ...c, unread: 0, mentioned: false } : c,
      ),
    );
    await api.post(`${base}/read`).catch(() => undefined);
  }, [qc, base, conversationId]);
  return useMemo(
    () => ({ upload, typing, markRead }),
    [upload, typing, markRead],
  );
}

export function useMessageActions(conversationId: string) {
  const sending = useSending(conversationId);
  const mutations = useMessageMutations(conversationId);
  const pings = useConversationPings(conversationId);
  return useMemo(
    () => ({ ...sending, ...mutations, ...pings }),
    [sending, mutations, pings],
  );
}

export type MessageActions = ReturnType<typeof useMessageActions>;
