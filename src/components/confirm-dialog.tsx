"use client";

import type { ReactNode } from "react";
import {
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmOptions = {
  title: string;
  description?: string;
  action: string;
  destructive?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** `if (await confirm({ title, action })) ...`: an accessible replacement for window.confirm. */
export function useConfirm() {
  const confirm = use(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>(undefined);

  const confirm = useCallback<Confirm>(
    async (next) =>
      await new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const close = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setOptions(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  return (
    <ConfirmContext value={value}>
      {children}
      <Dialog open={!!options} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description && (
              <DialogDescription>{options.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              variant={options?.destructive ? "destructive" : "default"}
              onClick={() => close(true)}
              autoFocus
            >
              {options?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext>
  );
}
