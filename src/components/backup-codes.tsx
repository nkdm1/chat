"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([`${codes.join("\n")}\n`], { type: "text/plain" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "chat-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-enter space-y-3">
      <p className="text-muted-foreground">
        Each code works once. Store them somewhere safe; they won't be shown
        again.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border p-3 font-mono">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="outline" size="sm" onClick={download}>
          Download
        </Button>
      </div>
    </div>
  );
}
