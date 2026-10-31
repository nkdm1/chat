import type { Container, Resource } from "@azure/cosmos";
import { CosmosClient, ErrorResponse } from "@azure/cosmos";
import { azureCredential } from "@/lib/azure";
import { env } from "@/lib/env";
import { ApiError } from "@/server/errors";
import type { MessageDoc, MessageStore } from "./types";
import { EtagMismatchError } from "./types";

type Stored = MessageDoc & Resource;
type Params = Record<string, string | number>;

/** HTTP status of a Cosmos error; 0 means a connectivity problem. */
function statusOf(error: unknown) {
  return error instanceof ErrorResponse && typeof error.code === "number"
    ? error.code
    : 0;
}

function unavailable(error: unknown): never {
  console.error("[cosmos]", error instanceof Error ? error.message : error);
  throw new ApiError(
    503,
    "STORE_UNAVAILABLE",
    "Messages are temporarily unavailable",
  );
}

/** Drops Cosmos system properties (_rid, _etag, ...). */
function strip({ _rid, _self, _etag, _ts, ...doc }: Stored): MessageDoc {
  return doc;
}

export class CosmosMessageStore implements MessageStore {
  private readonly client: CosmosClient;

  constructor() {
    this.client = env.COSMOS_CONNECTION_STRING
      ? new CosmosClient(env.COSMOS_CONNECTION_STRING)
      : new CosmosClient({
          endpoint: env.COSMOS_ENDPOINT ?? "",
          aadCredentials: azureCredential(),
        });
  }

  private get container(): Container {
    return this.client
      .database(env.COSMOS_DATABASE)
      .container(env.COSMOS_MESSAGES_CONTAINER);
  }

  /** Single-partition, parameterized query: user input is never part of the SQL. */
  private async query<T>(query: string, params: Params, partition: string) {
    try {
      const { resources } = await this.container.items
        .query<T>(
          {
            query,
            parameters: Object.entries(params).map(([name, value]) => ({
              name: `@${name}`,
              value,
            })),
          },
          { partitionKey: partition },
        )
        .fetchAll();
      return resources;
    } catch (error) {
      return unavailable(error);
    }
  }

  async create(doc: MessageDoc) {
    try {
      const { resource } = await this.container.items.create(doc);
      return { doc: resource ? strip(resource) : doc, created: true };
    } catch (error) {
      if (statusOf(error) !== 409) {
        return unavailable(error);
      }
      const existing = await this.get(doc.conversationId, doc.id);
      if (!existing) {
        return unavailable(error);
      }
      return { doc: existing.doc, created: false };
    }
  }

  async get(conversationId: string, id: string) {
    try {
      const { resource, etag } = await this.container
        .item(id, conversationId)
        .read<MessageDoc>();
      return resource ? { doc: strip(resource), etag } : null;
    } catch (error) {
      if (statusOf(error) === 404) {
        return null;
      }
      return unavailable(error);
    }
  }

  async replace(doc: MessageDoc, etag: string) {
    try {
      const { resource } = await this.container
        .item(doc.id, doc.conversationId)
        .replace(doc, {
          accessCondition: { type: "IfMatch", condition: etag },
        });
      return resource ? strip(resource) : doc;
    } catch (error) {
      if (statusOf(error) === 412) {
        throw new EtagMismatchError();
      }
      return unavailable(error);
    }
  }

  async page(conversationId: string, limit: number, before?: string) {
    const filter = before ? " AND c.sortKey < @before" : "";
    const rows = await this.query<Stored>(
      `SELECT TOP @n * FROM c WHERE c.conversationId = @cid${filter} ORDER BY c.sortKey DESC`,
      { n: limit, cid: conversationId, ...(before ? { before } : {}) },
      conversationId,
    );
    return rows.map(strip);
  }

  async after(conversationId: string, sortKey: string, limit: number) {
    const rows = await this.query<Stored>(
      "SELECT TOP @n * FROM c WHERE c.conversationId = @cid AND c.sortKey >= @key ORDER BY c.sortKey ASC",
      { n: limit, cid: conversationId, key: sortKey },
      conversationId,
    );
    return rows.map(strip);
  }

  async countUnread(conversationId: string, since: string, readerId: string) {
    const [count] = await this.query<number>(
      "SELECT VALUE COUNT(1) FROM c WHERE c.conversationId = @cid AND c.createdAt > @since AND c.senderId != @reader AND NOT IS_DEFINED(c.deletedAt)",
      { cid: conversationId, since, reader: readerId },
      conversationId,
    );
    return count ?? 0;
  }

  async search(conversationId: string, query: string, limit: number) {
    const rows = await this.query<Stored>(
      "SELECT TOP @n * FROM c WHERE c.conversationId = @cid AND NOT IS_DEFINED(c.deletedAt) AND CONTAINS(c.body, @q, true) ORDER BY c.sortKey DESC",
      { n: limit, cid: conversationId, q: query },
      conversationId,
    );
    return rows.map(strip);
  }

  async ping() {
    try {
      await this.container.read();
    } catch (error) {
      unavailable(error);
    }
  }

  /** Local emulator only (AUTO_PROVISION). In Azure, OpenTofu creates these. */
  async init() {
    const { database } = await this.client.databases.createIfNotExists({
      id: env.COSMOS_DATABASE,
    });
    await database.containers.createIfNotExists({
      id: env.COSMOS_MESSAGES_CONTAINER,
      partitionKey: { paths: ["/conversationId"] },
    });
  }
}
