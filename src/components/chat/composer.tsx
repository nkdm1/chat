"use client";

import { cn } from "cn";
import {
  FileTextIcon,
  PaperclipIcon,
  SendHorizontalIcon,
  XIcon,
} from "lucide-react";
import type { Ref, RefObject } from "react";
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import type { MessageActions } from "@/hooks/use-message-actions";
import { errorMessage } from "@/lib/api";
import type { AttachmentRef, Member, Message } from "@/lib/chat-types";
import {
  ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MESSAGE_MAX,
} from "@/lib/validation";
import { EmojiPicker } from "./emoji-picker";

type Upload = {
  key: string;
  name: string;
  status: "uploading" | "done" | "error";
  ref?: AttachmentRef;
  error?: string;
};

export type ComposerHandle = {
  addFiles: (files: File[]) => void;
  focus: () => void;
};

export type ComposerMode =
  | { kind: "reply"; message: Message }
  | { kind: "edit"; message: Message }
  | null;

type Props = {
  ref?: Ref<ComposerHandle>;
  actions: MessageActions;
  members: Member[];
  meId: string;
  disabled: boolean;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  lastOwnMessage?: Message;
};

/** Client-side pre-check only; the server re-validates by content. */
function precheck(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
    return `${file.name}: only ${ATTACHMENT_EXTENSIONS.join(", ")} files`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}: larger than 5 MB`;
  }
  return null;
}

/** The `@partial` right before the caret, if any. */
function mentionQuery(text: string, caret: number) {
  const match = /(?:^|\s)@([a-z0-9_]{0,24})$/i.exec(text.slice(0, caret));
  return match ? match[1].toLowerCase() : null;
}

function useUploads(actions: MessageActions) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  function addFiles(files: File[]) {
    setNotice(null);
    const room = MAX_ATTACHMENTS - uploads.length;
    if (files.length > room) {
      setNotice(`Up to ${MAX_ATTACHMENTS} attachments per message.`);
    }
    for (const file of files.slice(0, Math.max(room, 0))) {
      const problem = precheck(file);
      if (problem) {
        setNotice(problem);
        continue;
      }
      // Pasted screenshots are all called "image.png"; make them distinguishable.
      const named =
        file.name === "image.png"
          ? new File([file], `screenshot-${Date.now()}.png`, {
              type: file.type,
            })
          : file;
      const key = crypto.randomUUID();
      setUploads((list) => [
        ...list,
        { key, name: named.name, status: "uploading" },
      ]);
      actions
        .upload(named)
        .then((ref) =>
          setUploads((list) =>
            list.map((u) =>
              u.key === key ? { ...u, status: "done", ref } : u,
            ),
          ),
        )
        .catch((error: unknown) => {
          setNotice(`${named.name}: ${errorMessage(error)}`);
          setUploads((list) =>
            list.map((u) =>
              u.key === key
                ? { ...u, status: "error", error: errorMessage(error) }
                : u,
            ),
          );
        });
    }
  }
  return { uploads, setUploads, notice, setNotice, addFiles };
}

function ModeBar({
  mode,
  onCancel,
}: {
  mode: NonNullable<ComposerMode>;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-online border-l-2 bg-muted/50 px-3 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate">
        {mode.kind === "edit" ? (
          <span className="font-medium">Editing message</span>
        ) : (
          <>
            Replying to{" "}
            <span className="font-medium">{mode.message.senderName}</span>:{" "}
            <span className="text-muted-foreground">
              {mode.message.body || "Attachment"}
            </span>
          </>
        )}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Cancel"
        onClick={onCancel}
      >
        <XIcon />
      </Button>
    </div>
  );
}

function UploadChips({
  uploads,
  onRemove,
}: {
  uploads: Upload[];
  onRemove: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-2">
      {uploads.map((u) => (
        <span
          key={u.key}
          title={u.error}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
            u.status === "error" && "border-destructive/50 text-destructive",
          )}
        >
          {u.status === "uploading" ? (
            <Spinner />
          ) : (
            <FileTextIcon className="size-3.5" />
          )}
          <span className="max-w-32 truncate">{u.name}</span>
          <button
            type="button"
            aria-label={`Remove ${u.name}`}
            onClick={() => onRemove(u.key)}
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function MentionList({
  options,
  active,
  onPick,
}: {
  options: Member[];
  active: number;
  onPick: (m: Member) => void;
}) {
  return (
    <ul
      className="absolute bottom-full left-4 z-10 -mb-2 w-56 animate-enter overflow-hidden rounded-lg border bg-popover py-1 shadow-md"
      aria-label="Mention someone"
    >
      {options.map((m, i) => (
        <li key={m.userId} aria-current={i === active ? "true" : undefined}>
          <button
            type="button"
            className={cn(
              "w-full px-3 py-1.5 text-left text-sm",
              i === active && "bg-muted",
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(m);
            }}
          >
            @{m.username}
          </button>
        </li>
      ))}
    </ul>
  );
}

type MentionState = { query: string; active: number } | null;

function useMentions(members: Member[], meId: string) {
  const [state, setState] = useState<MentionState>(null);
  const options = state
    ? members
        .filter((m) => m.userId !== meId && m.username.startsWith(state.query))
        .slice(0, 6)
    : [];
  return {
    options,
    active: state?.active ?? 0,
    update: (text: string, caret: number) => {
      const query = mentionQuery(text, caret);
      setState(query === null ? null : { query, active: 0 });
    },
    move: (step: number) =>
      setState(
        (m) =>
          m && {
            ...m,
            active: (m.active + step + options.length) % options.length,
          },
      ),
    clear: () => setState(null),
  };
}

type DraftDeps = Pick<Props, "actions" | "mode" | "onModeChange" | "disabled">;

/** Draft text, attachments and submit (send or save an edit). */
function useDraft({ actions, mode, onModeChange, disabled }: DraftDeps) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const uploads = useUploads(actions);
  const ready = uploads.uploads.flatMap((u) =>
    u.status === "done" && u.ref ? [u.ref] : [],
  );
  const busy = uploads.uploads.some((u) => u.status === "uploading");
  const tooLong = body.length > MESSAGE_MAX;
  const canSend =
    !disabled &&
    !busy &&
    !tooLong &&
    !saving &&
    (body.trim().length > 0 || ready.length > 0);

  function reset() {
    setBody("");
    uploads.setUploads([]);
    uploads.setNotice(null);
    onModeChange(null);
  }

  async function saveEdit(message: Message) {
    setSaving(true);
    try {
      await actions.edit(message, body);
      reset();
    } catch (error) {
      uploads.setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!canSend) {
      return;
    }
    if (mode?.kind === "edit") {
      await saveEdit(mode.message);
      return;
    }
    const draft = {
      body,
      attachments: ready,
      replyTo: mode?.kind === "reply" ? mode.message : undefined,
    };
    reset();
    await actions.send(draft);
  }

  return { body, setBody, saving, tooLong, canSend, reset, submit, ...uploads };
}

/** Replaces the text before the caret, then restores the caret after it. */
function editAtCaret(
  el: HTMLTextAreaElement | null,
  body: string,
  setBody: (v: string) => void,
  transform: (before: string) => string,
) {
  const caret = el?.selectionStart ?? body.length;
  const before = transform(body.slice(0, caret));
  setBody(before + body.slice(caret));
  requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange(before.length, before.length);
  });
}

function AttachButton({
  disabled,
  onFiles,
}: {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const files = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={files}
        type="file"
        multiple
        hidden
        accept={ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Attach files"
        disabled={disabled}
        onClick={() => files.current?.click()}
      >
        <PaperclipIcon />
      </Button>
    </>
  );
}

function ComposerFooter({
  notice,
  length,
}: {
  notice: string | null;
  length: number;
}) {
  return (
    <div className="flex justify-between px-2 pt-1 text-xs">
      <span className="text-destructive" role={notice ? "alert" : undefined}>
        {notice}
      </span>
      {length > MESSAGE_MAX - 200 && (
        <span
          className={cn(
            "tabular-nums",
            length > MESSAGE_MAX ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {length}/{MESSAGE_MAX}
        </span>
      )}
    </div>
  );
}

type KeyDeps = {
  mentions: ReturnType<typeof useMentions>;
  insertMention: (m: Member) => void;
  draft: ReturnType<typeof useDraft>;
} & Pick<Props, "mode" | "onModeChange" | "lastOwnMessage">;

function useComposerKeys({
  mentions,
  insertMention,
  draft,
  mode,
  onModeChange,
  lastOwnMessage,
}: KeyDeps) {
  return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const picking = mentions.options.length > 0;
    if (picking && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      mentions.move(e.key === "ArrowDown" ? 1 : -1);
    } else if (picking && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      insertMention(mentions.options[mentions.active] ?? mentions.options[0]);
    } else if (e.key === "Escape") {
      mentions.clear();
      if (mode) {
        draft.reset();
      }
    } else if (e.key === "ArrowUp" && !draft.body && !mode && lastOwnMessage) {
      e.preventDefault();
      onModeChange({ kind: "edit", message: lastOwnMessage });
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void draft.submit();
    }
  };
}

function useInputEffects(
  input: RefObject<HTMLTextAreaElement | null>,
  mode: ComposerMode,
  setBody: (v: string) => void,
) {
  useEffect(() => {
    if (mode?.kind === "edit") {
      setBody(mode.message.body);
    }
    input.current?.focus();
  }, [input, mode, setBody]);

  // Grow with content up to a cap (after every render; it's one style write).
  useLayoutEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  });
}

type TextareaProps = {
  input: RefObject<HTMLTextAreaElement | null>;
  body: string;
  disabled: boolean;
  onChange: (value: string, caret: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  onFiles: (files: File[]) => void;
};

function MessageTextarea({
  input,
  body,
  disabled,
  onChange,
  onKeyDown,
  onBlur,
  onFiles,
}: TextareaProps) {
  return (
    <textarea
      ref={input}
      rows={1}
      value={body}
      disabled={disabled}
      aria-label="Message"
      placeholder={disabled ? "You can't send messages here" : "Message"}
      className="max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onPaste={(e) => {
        const pasted = [...e.clipboardData.files];
        if (pasted.length) {
          e.preventDefault();
          onFiles(pasted);
        }
      }}
    />
  );
}

export function Composer(props: Props) {
  const { ref, actions, members, meId, disabled, mode } = props;
  const input = useRef<HTMLTextAreaElement>(null);
  const draft = useDraft(props);
  const mentions = useMentions(members, meId);
  const insertMention = (member: Member) => {
    editAtCaret(input.current, draft.body, draft.setBody, (b) =>
      b.replace(/@[a-z0-9_]*$/i, `@${member.username} `),
    );
    mentions.clear();
  };
  const onKeyDown = useComposerKeys({
    ...props,
    mentions,
    insertMention,
    draft,
  });
  const { setBody } = draft;

  useImperativeHandle(ref, () => ({
    addFiles: draft.addFiles,
    focus: () => input.current?.focus(),
  }));

  useInputEffects(input, mode, setBody);

  return (
    <div className="relative border-t bg-background p-3">
      {mentions.options.length > 0 && (
        <MentionList
          options={mentions.options}
          active={mentions.active}
          onPick={insertMention}
        />
      )}
      <div className="overflow-hidden rounded-2xl border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        {mode && <ModeBar mode={mode} onCancel={draft.reset} />}
        {draft.uploads.length > 0 && (
          <UploadChips
            uploads={draft.uploads}
            onRemove={(key) =>
              draft.setUploads((list) => list.filter((u) => u.key !== key))
            }
          />
        )}
        <div className="flex items-end gap-1 p-1.5">
          {mode?.kind !== "edit" && (
            <AttachButton disabled={disabled} onFiles={draft.addFiles} />
          )}
          <MessageTextarea
            input={input}
            body={draft.body}
            disabled={disabled}
            onChange={(value, caret) => {
              draft.setBody(value);
              mentions.update(value, caret);
              if (value) {
                actions.typing();
              }
            }}
            onKeyDown={onKeyDown}
            onBlur={mentions.clear}
            onFiles={draft.addFiles}
          />
          <EmojiPicker
            onPick={(emoji) =>
              editAtCaret(
                input.current,
                draft.body,
                draft.setBody,
                (b) => b + emoji,
              )
            }
          />
          <Button
            type="button"
            size="icon"
            aria-label={mode?.kind === "edit" ? "Save" : "Send"}
            disabled={!draft.canSend}
            onClick={draft.submit}
          >
            {draft.saving ? <Spinner /> : <SendHorizontalIcon />}
          </Button>
        </div>
      </div>
      <ComposerFooter notice={draft.notice} length={draft.body.length} />
    </div>
  );
}
