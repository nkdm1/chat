"use client";

import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ConfirmProvider } from "@/components/confirm-dialog";

let browserClient: QueryClient | undefined;

// One client per server request, one shared client in the browser.
function getQueryClient() {
  if (isServer) {
    return new QueryClient();
  }
  browserClient ??= new QueryClient();
  return browserClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  );
}
