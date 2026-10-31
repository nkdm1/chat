"use client";

import { cn } from "cn";
import {
  FileTextIcon,
  FlagIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ReplyIcon,
  SmilePlusIcon,
  Trash2Icon,
} from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AttachmentRef, Member, Message } from "@/lib/chat-types";
import { clockTime, formatBytes, fullTime } from "@/lib/format";
import { REACTION_EMOJI } from "@/lib/validation";
import { MessageText } from "./message-text";
import { UserAvatar } from "./user-avatar";

export type MessageHandlers = {
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onReport: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
  onRetry: (m: Message) => void;
  onJump: (id: string) => void;
  onOpenImage: (a: AttachmentRef) => void;
};

type Props = {
  message: Message;
  mine: boolean;
  meId: string;
  showSender: boolean;
  canModerate: boolean;
  highlighted: boolean;
  seenBy: Member[];
  isDirect: boolean;
  usernames: Set<string>;
  names: Map<string, string>;
  handlers: MessageHandlers;
};

function Attachments({
  items,
  onOpenImage,
}: {
  items: AttachmentRef[];
  onOpenImage: (a: AttachmentRef) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((a) =>
        a.mime.startsWith("image/") ? (
          <button
            key={a.id}
            type="button"
            className="overflow-hidden rounded-xl border bg-muted"
            onClick={() => onOpenImage(a)}
            aria-label={`Open ${a.name}`}
          >
            {/* oxlint-disable-next-line nextjs/no-img-element */}
            <img
              src={`/api/attachments/${a.id}`}
              alt={a.name}
              loading="lazy"
              className="max-h-56 max-w-60 object-cover"
            />
          </button>
        ) : (
          <a
            key={a.id}
            href={`/api/attachments/${a.id}`}
            download={a.name}
            className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm hover:bg-muted"
          >
            <FileTextIcon className="size-4 text-muted-foreground" />
            <span className="max-w-40 truncate">{a.name}</span>
            <span className="text-muted-foreground text-xs">
              {formatBytes(a.size)}
            </span>
          </a>
        ),
      )}
    </div>
  );
}

function Reactions({
  message,
  meId,
  onReact,
}: {
  message: Message;
  meId: string;
  onReact: MessageHandlers["onReact"];
}) {
  if (message.reactions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {message.reactions.map((r) => {
        const reacted = r.userIds.includes(meId);
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={() => onReact(message, r.emoji)}
            aria-pressed={reacted}
            className={cn(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs tabular-nums transition-colors",
              reacted
                ? "border-online/50 bg-online/10"
                : "bg-card hover:bg-muted",
            )}
          >
            <span>{r.emoji}</span>
            {r.userIds.length}
          </button>
        );
      })}
    </div>
  );
}

function Actions({
  message,
  mine,
  canModerate,
  handlers,
}: Pick<Props, "message" | "mine" | "canModerate" | "handlers">) {
  return (
    <div
      className={cn(
        "flex items-center self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60",
        mine ? "order-first" : "order-last",
      )}
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="React">
            <SmilePlusIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-fit gap-0.5 p-1" side="top">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-muted"
              onClick={() => handlers.onReact(message, emoji)}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Reply"
        onClick={() => handlers.onReply(message)}
      >
        <ReplyIcon />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mine ? "end" : "start"}>
          {mine && message.body && (
            <DropdownMenuItem onSelect={() => handlers.onEdit(message)}>
              <PencilIcon /> Edit
            </DropdownMenuItem>
          )}
          {(mine || canModerate) && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => handlers.onDelete(message)}
            >
              <Trash2Icon /> Delete
            </DropdownMenuItem>
          )}
          {!mine && (
            <>
              {canModerate && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => handlers.onReport(message)}>
                <FlagIcon /> Report
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SeenBy({
  readers,
  isDirect,
}: {
  readers: Member[];
  isDirect: boolean;
}) {
  if (readers.length === 0) {
    return null;
  }
  if (isDirect) {
    return <span className="text-muted-foreground text-xs">Seen</span>;
  }
  return (
    <span
      className="flex -space-x-1"
      title={`Seen by ${readers.map((r) => r.username).join(", ")}`}
    >
      {readers.slice(0, 5).map((r) => (
        <UserAvatar
          key={r.userId}
          name={r.username}
          size="sm"
          className="size-4 border border-background text-[0.5rem]"
        />
      ))}
    </span>
  );
}

function Status({
  message,
  mine,
  onRetry,
}: {
  message: Message;
  mine: boolean;
  onRetry: (m: Message) => void;
}) {
  if (message.failed) {
    return (
      <button
        type="button"
        className="text-destructive text-xs underline"
        onClick={() => onRetry(message)}
      >
        Not sent. Retry
      </button>
    );
  }
  return (
    <span
      className="text-muted-foreground text-xs"
      title={fullTime(message.createdAt)}
    >
      {message.pending && mine ? "Sending…" : clockTime(message.createdAt)}
      {message.editedAt && " · edited"}
    </span>
  );
}

function MessageItemImpl(props: Props) {
  const { message, mine, showSender, highlighted, handlers, names } = props;
  const deleted = !!message.deletedAt;
  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "group flex animate-enter scroll-my-24 flex-col gap-1 rounded-xl px-1 py-0.5 transition-colors duration-700",
        mine ? "items-end" : "items-start",
        highlighted && "bg-online/10",
      )}
    >
      {showSender && !mine && (
        <span className="px-3 text-muted-foreground text-xs">
          {message.senderName}
        </span>
      )}
      <div
        className={cn(
          "flex max-w-[85%] items-end gap-1 sm:max-w-[75%]",
          mine && "flex-row-reverse",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1",
            mine ? "items-end" : "items-start",
          )}
        >
          {message.replyTo && !deleted && (
            <button
              type="button"
              onClick={() => handlers.onJump(message.replyTo?.id ?? "")}
              className="max-w-full truncate rounded-lg border-l-2 border-online/60 bg-muted/60 px-2 py-1 text-left text-muted-foreground text-xs hover:bg-muted"
            >
              <span className="font-medium">
                {names.get(message.replyTo.senderId) ?? "someone"}
              </span>
              : {message.replyTo.preview}
            </button>
          )}
          {deleted ? (
            <p className="rounded-2xl border border-dashed px-3.5 py-2 text-muted-foreground text-sm italic">
              Message deleted
            </p>
          ) : (
            <>
              {message.body && (
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm",
                    mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted",
                    message.pending && "opacity-70",
                  )}
                >
                  <MessageText
                    text={message.body}
                    usernames={props.usernames}
                    mine={mine}
                  />
                </div>
              )}
              {message.attachments.length > 0 && (
                <Attachments
                  items={message.attachments}
                  onOpenImage={handlers.onOpenImage}
                />
              )}
              <Reactions
                message={message}
                meId={props.meId}
                onReact={handlers.onReact}
              />
            </>
          )}
        </div>
        {!deleted && !message.pending && !message.failed && (
          <Actions
            message={message}
            mine={mine}
            canModerate={props.canModerate}
            handlers={handlers}
          />
        )}
      </div>
      <div className="flex items-center gap-2 px-1">
        <Status message={message} mine={mine} onRetry={handlers.onRetry} />
        {mine && <SeenBy readers={props.seenBy} isDirect={props.isDirect} />}
      </div>
    </div>
  );
}

export const MessageItem = memo(MessageItemImpl);
