"use client";

import type {
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from "frimousse";
import { EmojiPicker as Picker } from "frimousse";
import { SmileIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function CategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      className="bg-popover px-3 pt-3 pb-1.5 font-medium text-muted-foreground text-xs"
      {...props}
    >
      {category.label}
    </div>
  );
}

function Row({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div className="scroll-my-1.5 px-1.5" {...props}>
      {children}
    </div>
  );
}

function Emoji({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button
      type="button"
      className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-muted"
      {...props}
    >
      {emoji.emoji}
    </button>
  );
}

const LIST_COMPONENTS = { CategoryHeader, Row, Emoji };
const CENTERED =
  "absolute inset-0 flex items-center justify-center text-muted-foreground";

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Insert emoji"
        >
          <SmileIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-fit p-0">
        <Picker.Root
          emojibaseUrl="/emojibase"
          className="isolate flex h-80 w-72 flex-col"
          onEmojiSelect={({ emoji }) => {
            onPick(emoji);
            setOpen(false);
          }}
        >
          <Picker.Search
            className="m-2 h-8 rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder="Search emoji"
          />
          <Picker.Viewport className="relative flex-1 outline-none">
            <Picker.Loading className={CENTERED}>Loading…</Picker.Loading>
            <Picker.Empty className={CENTERED}>No emoji found.</Picker.Empty>
            <Picker.List
              className="select-none pb-2"
              components={LIST_COMPONENTS}
            />
          </Picker.Viewport>
        </Picker.Root>
      </PopoverContent>
    </Popover>
  );
}
