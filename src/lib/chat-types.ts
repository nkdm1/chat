// Shapes returned by the chat API (see docs/architecture.md).

export type AttachmentRef = {
  id: string;
  name: string;
  mime: string;
  size: number;
};
export type Reaction = { emoji: string; userIds: string[] };

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  attachments: AttachmentRef[];
  replyTo?: { id: string; senderId: string; preview: string };
  mentions: string[];
  reactions: Reaction[];
  createdAt: string;
  sortKey: string;
  editedAt?: string;
  deletedAt?: string;
  /** Client-only: optimistic message not yet confirmed by the server. */
  pending?: boolean;
  failed?: boolean;
  clientMessageId?: string;
};

export type MessagePage = {
  messages: Message[];
  hasMore: boolean;
  hasNewer: boolean;
};

export type ConversationSummary = {
  id: string;
  type: "direct" | "group";
  title: string;
  peerId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  unread: number;
  mentioned: boolean;
  muted: boolean;
  mutedUntil: string | null;
  role: "owner" | "member";
};

export type Member = {
  userId: string;
  username: string;
  role: "owner" | "member";
  lastReadAt: string | null;
  joinedAt: string;
};

export type ConversationDetails = {
  id: string;
  type: "direct" | "group";
  title: string;
  peerId: string | null;
  canSend: boolean;
  role: "owner" | "member";
  muted: boolean;
  mutedUntil: string | null;
  members: Member[];
};

export type Friend = {
  requestId: string;
  userId: string;
  username: string;
  since: string;
  online: boolean;
};

export type FriendRequest = {
  requestId: string;
  userId: string;
  username: string;
  createdAt: string;
};

export type FriendsList = {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

export type Me = { id: string; username: string; role: string };
