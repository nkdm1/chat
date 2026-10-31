"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { AttachmentRef } from "@/lib/chat-types";

export function Lightbox({
  image,
  onClose,
}: {
  image: AttachmentRef | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[min(90vw,64rem)] gap-3 p-3 sm:max-w-[min(90vw,64rem)]">
        <DialogTitle className="truncate pr-8 font-normal text-muted-foreground text-sm">
          {image?.name}
        </DialogTitle>
        {image && (
          <>
            {/* oxlint-disable-next-line nextjs/no-img-element */}
            <img
              src={`/api/attachments/${image.id}`}
              alt={image.name}
              className="mx-auto max-h-[75vh] max-w-full rounded-lg object-contain"
            />
            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/attachments/${image.id}`} download={image.name}>
                  <DownloadIcon /> Download
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
