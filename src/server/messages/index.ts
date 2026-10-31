import { env } from "@/lib/env";
import { CosmosMessageStore } from "./cosmos";
import type { MessageStore } from "./types";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export * from "./types";

let store: MessageStore | undefined;
let provisioned: Promise<void> | undefined;

export function messageStore(): MessageStore {
  if (!store) {
    store = new CosmosMessageStore();
    if (env.AUTO_PROVISION) {
      provisioned = store.init().catch((error: unknown) => {
        provisioned = undefined;
        console.warn("[cosmos] auto-provision failed:", errorMessage(error));
      });
    }
  }
  return store;
}

export async function ensureProvisioned() {
  messageStore();
  await provisioned;
}

/** Tests swap in the in-memory store. */
export function setMessageStore(next: MessageStore) {
  store = next;
}
