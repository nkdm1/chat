"use client";

import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";

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
      {children}
    </QueryClientProvider>
  );
}
