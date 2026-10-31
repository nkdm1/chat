import type { ContainerClient } from "@azure/storage-blob";
import { BlobServiceClient } from "@azure/storage-blob";
import { azureCredential } from "@/lib/azure";
import { env } from "@/lib/env";

// Attachments live in a private blob container. Browsers never get blob URLs
// or SAS tokens: downloads stream through our API after a membership check.
let container: ContainerClient | undefined;
let created: Promise<unknown> | undefined;

export function blobs(): ContainerClient {
  if (!container) {
    const service = env.AZURE_STORAGE_CONNECTION_STRING
      ? BlobServiceClient.fromConnectionString(
          env.AZURE_STORAGE_CONNECTION_STRING,
        )
      : new BlobServiceClient(
          env.AZURE_STORAGE_ACCOUNT_URL ?? "",
          azureCredential(),
        );
    container = service.getContainerClient(env.AZURE_STORAGE_CONTAINER);
  }
  return container;
}

/** Local emulator only; in Azure, OpenTofu creates the container. */
export async function ensureBlobContainer() {
  if (!env.AUTO_PROVISION) {
    return;
  }
  created ??= blobs()
    .createIfNotExists()
    .catch((error: unknown) => {
      created = undefined;
      throw error;
    });
  await created;
}
