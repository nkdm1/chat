import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { azureCredential } from "@/lib/azure";
import { env } from "@/lib/env";

// Server -> browser pushes via Azure Web PubSub (the official emulator locally).
// Clients get no roles: they can only receive. All writes go through our API.

export type RealtimeEvent = { type: string } & Record<string, unknown>;

export interface Publisher {
  clientUrl(userId: string): Promise<string>;
  toUsers(userIds: string[], event: RealtimeEvent): Promise<void>;
  disconnectUser(userId: string): Promise<void>;
  ping(): Promise<void>;
}

const insecure = (url: string) => url.startsWith("http://");

function keyClient(connectionString: string) {
  return new WebPubSubServiceClient(connectionString, env.WEBPUBSUB_HUB, {
    allowInsecureConnection: insecure(
      /Endpoint=([^;]+)/i.exec(connectionString)?.[1] ?? "",
    ),
  });
}

class WebPubSubPublisher implements Publisher {
  private readonly client: WebPubSubServiceClient;
  // Signs client URLs. With an access key the token is signed locally and its
  // audience is the endpoint, so it must be the origin browsers connect to:
  // otherwise the service rejects the WebSocket with 401.
  private readonly tokenClient: WebPubSubServiceClient;

  constructor() {
    const cs = env.WEBPUBSUB_CONNECTION_STRING;
    this.client = cs
      ? keyClient(cs)
      : new WebPubSubServiceClient(
          env.WEBPUBSUB_ENDPOINT ?? "",
          azureCredential(),
          env.WEBPUBSUB_HUB,
          { allowInsecureConnection: insecure(env.WEBPUBSUB_ENDPOINT ?? "") },
        );
    const origin = env.WEBPUBSUB_CLIENT_ORIGIN?.replace(/^ws/i, "http");
    this.tokenClient =
      cs && origin
        ? keyClient(cs.replace(/Endpoint=[^;]+/i, `Endpoint=${origin}`))
        : this.client;
  }

  async clientUrl(userId: string) {
    const { url } = await this.tokenClient.getClientAccessToken({
      userId,
      roles: [],
      expirationTimeInMinutes: 5,
    });
    // Inside docker-compose the server reaches the emulator by service name,
    // but the browser must use the host-published origin. (Already true for
    // key-signed URLs; managed-identity URLs still need the rewrite.)
    if (!env.WEBPUBSUB_CLIENT_ORIGIN) {
      return url;
    }
    const client = new URL(url);
    const origin = new URL(env.WEBPUBSUB_CLIENT_ORIGIN);
    client.protocol = origin.protocol;
    client.host = origin.host;
    return client.toString();
  }

  async toUsers(userIds: string[], event: RealtimeEvent) {
    // Persisted data is the source of truth; a failed push only delays the UI
    // (clients refetch on reconnect / poll while disconnected).
    const results = await Promise.allSettled(
      [...new Set(userIds)].map(
        async (id) => await this.client.sendToUser(id, event),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      console.warn(
        `[realtime] ${failed.length} push(es) failed for ${event.type}`,
      );
    }
  }

  async disconnectUser(userId: string) {
    try {
      await this.client.closeUserConnections(userId);
    } catch (error) {
      console.warn(
        "[realtime] disconnect failed",
        error instanceof Error ? error.message : error,
      );
    }
  }

  async ping() {
    await this.client.userExists("healthcheck");
  }
}

let publisher: Publisher | undefined;

export function realtime(): Publisher {
  publisher ??= new WebPubSubPublisher();
  return publisher;
}

/** Tests swap in a recording fake. */
export function setPublisher(next: Publisher) {
  publisher = next;
}
