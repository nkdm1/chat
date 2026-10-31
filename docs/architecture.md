# Architecture

Lab 2 adds a realtime chat to the Lab 1 app: friend codes, direct messages, groups, typing indicators, presence, read receipts, reactions, replies, mentions, search, attachments, reports and an admin panel.

Everything that will run on Azure is reached through the **real Azure SDKs**. Locally they talk to official emulators in docker-compose, so moving to Azure changes configuration, not code. See [azure-deployment.md](azure-deployment.md) for the step-by-step guide.

## Components

| Concern | Local (docker-compose) | Azure | Code |
|---|---|---|---|
| Accounts, friendships, groups, read positions, reactions, reports | PostgreSQL 17 | PostgreSQL Flexible Server | Drizzle, `src/db/schema` |
| Messages | Cosmos DB vNext emulator | Cosmos DB (NoSQL) | `@azure/cosmos`, `src/server/messages` |
| Attachments | Azurite | Blob Storage | `@azure/storage-blob`, `src/server/blob.ts` |
| Realtime (server → browser) | Web PubSub emulator | Web PubSub | `@azure/web-pubsub`, `src/server/realtime.ts`; browser `@azure/web-pubsub-client` |
| Rate limits, presence, typing, unread counters | Redis 7 | Azure Managed Redis | `ioredis`, `src/server/redis.ts` |
| Email | Mailpit (SMTP) | Communication Services | `src/lib/email.ts` (`EMAIL_PROVIDER`) |

## Request flow

1. The browser calls the REST API (`src/app/api/**`). Every handler is wrapped in `withUser` (`src/server/http.ts`), which:
   - requires a session that is verified and not banned;
   - checks `Origin` on writes (CSRF);
   - caps the JSON body at 16 KB;
   - applies rate limits;
   - returns errors as `{ error: { code, message } }`.
2. **Writes go over HTTPS only.** A message is validated (zod), sanitized (`sanitize-html`, `src/server/sanitize.ts`), authorized (membership in PostgreSQL), stored in Cosmos, then pushed to members with `sendToUser`.
3. **Sockets are receive-only.** The browser gets a 5-minute Web PubSub URL from `POST /api/negotiate`. The user id in it comes from the session, and the client has no roles, so it can't send to groups or users.
4. If the socket is down, the UI polls every 15 s. Persisted data is the source of truth, so a missed push only delays the UI.

### Message storage (Cosmos)

- Container `messages`, partition key `/conversationId`.
- Every query is single-partition and sorts on one field (`sortKey = createdAt_id`), so no composite indexes or cross-partition queries are needed.
- The message id is `sha256(senderId:clientMessageId)`. A retried send hits 409 and returns the stored message, and the side effects (preview, stats, unread counters) are idempotent.
- Edits and deletes use ETag optimistic concurrency. Deletes are soft (`deletedAt`).
- Unread counts are Redis counters, deduplicated per message id. If Redis is missing or empty, they are rebuilt from Cosmos (`COUNT` after `last_read_at`).

### Degradation

| Down | Effect |
|---|---|
| Redis | Rate limits, presence and typing fall back to per-process memory; unread counts are rebuilt from Cosmos. `/api/ready` reports `redis: degraded`. |
| Web PubSub | Messages are still stored; the UI shows "Reconnecting…" and polls; the client reconnects on its own. |
| Cosmos | Sending and history return `503 STORE_UNAVAILABLE`; everything in PostgreSQL keeps working. |

## API

All routes are under `/api`, JSON, same-origin, with session cookies.

| Method and path | Purpose |
|---|---|
| `GET /me/friend-code`, `POST /me/friend-code/regenerate` | Your 6-digit code |
| `GET /friends` | Friends (with presence), incoming and outgoing requests |
| `POST /friends/requests {code}` | Send a request (auto-accepts a mutual one) |
| `POST /friends/requests/:id/accept`, `DELETE /friends/requests/:id` | Accept, decline or cancel |
| `DELETE /friends/:userId` | Unfriend |
| `GET /conversations`, `POST /conversations {name, memberIds}` | List with unread counts; create a group |
| `POST /conversations/direct {userId}` | Get or create a DM |
| `GET /conversations/:id`, `PATCH /conversations/:id {name}` | Details; rename (owner) |
| `POST /conversations/:id/members {userIds}`, `DELETE /conversations/:id/members/:userId` | Add (owner); kick (owner) or leave |
| `GET /conversations/:id/messages?before=&around=&limit=` | History (cursor = `sortKey`) |
| `POST /conversations/:id/messages {body, clientMessageId, attachmentIds?, replyToId?}` | Send |
| `GET /conversations/:id/search?q=` | Search within the conversation |
| `PATCH /conversations/:id/membership {mutedFor}` | Mute: `1`, `8` or `24` hours, `"forever"`, or `null` to unmute |
| `POST /conversations/:id/read`, `POST /conversations/:id/typing` | Mark read; typing ping |
| `POST /conversations/:id/attachments` (multipart `file`), `GET /attachments/:id` | Upload; download |
| `PATCH /messages/:id {conversationId, body}`, `DELETE /messages/:id?conversationId=` | Edit own; delete (own, group owner, admin) |
| `POST /messages/:id/reactions {conversationId, emoji}` | Toggle a reaction |
| `POST /messages/:id/report {conversationId, reason, details?}` | Report |
| `POST /presence/heartbeat`, `POST /negotiate` | Presence; Web PubSub client URL |
| `GET /health`, `GET /ready` | Liveness; readiness |
| `GET /admin/metrics`, `GET /admin/reports?status=`, `POST /admin/reports/:id {action, banDays?, note?}` | Admin dashboard and report queue |
| `GET /admin/users?q=`, `POST /admin/users/:id {action, banDays?, reason?}`, `GET /admin/audit` | Users and audit log |

The realtime event payloads (`type` field) are:
- `message.created|updated|deleted|reactions`
- `typing`
- `conversation.read|updated|member.added|member.removed`
- `friend.request|accepted|removed`
- `presence`

## Security controls

| Control | Where |
|---|---|
| Server-side validation (length, characters, required fields) | `src/lib/validation.ts` (zod), re-checked after sanitizing |
| HTML sanitization | `sanitize-html`, all tags stripped; rendered as React text only |
| Rate limits | `src/server/rate-limit.ts`, Redis sliding window: messages 10/10 s, friend codes 5/min and 30/day, uploads 10/min, reports 10/h, search 30/min, other writes 120/min |
| Size limits | 2000-character messages, 16 KB JSON bodies, 5 MB files, 4 attachments per message, 50 members per group |
| Attachments | Extension allowlist; magic bytes must match; SVG and HTML rejected; random blob names; served through the API with `nosniff` and `CSP: sandbox` |
| Authorization | Non-members get 404 (no probing); DMs need an active friendship; groups only contain friends |
| CSP | Per request in `src/proxy.ts`: script nonce, `connect-src` from env |
| Moderation | Reports keep a snapshot of the message; admins see only the reported message; every admin action is audited; bans revoke sessions and close sockets |

## Configuration reference

`src/lib/env.ts` is the only reader of `process.env`. It validates everything at startup and refuses to start if something is missing.

| Variable | Purpose | Local value | Azure source | Secret |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL | compose | Key Vault | yes |
| `BETTER_AUTH_SECRET` | Session signing | random | Key Vault | yes |
| `BETTER_AUTH_URL` | Public origin | `http://localhost:3000` | ConfigMap | no |
| `EMAIL_PROVIDER` | `smtp` or `acs` | `smtp` | ConfigMap | no |
| `MAIL_FROM`, `SMTP_*` | SMTP | Mailpit | ConfigMap; `SMTP_PASS` from Key Vault | `SMTP_PASS` |
| `ACS_ENDPOINT`, `ACS_SENDER_ADDRESS` | ACS Email | — | ConfigMap | no |
| `REDIS_URL` | Redis | `redis://localhost:6379` | Key Vault (contains the key) | yes |
| `COSMOS_ENDPOINT`, `COSMOS_DATABASE`, `COSMOS_MESSAGES_CONTAINER` | Cosmos | emulator connection string | ConfigMap | no |
| `WEBPUBSUB_ENDPOINT`, `WEBPUBSUB_HUB`, `WEBPUBSUB_CLIENT_ORIGIN` | Web PubSub | emulator connection string | ConfigMap | no |
| `AZURE_STORAGE_ACCOUNT_URL`, `AZURE_STORAGE_CONTAINER` | Blob | Azurite connection string | ConfigMap | no |
| `*_CONNECTION_STRING` | Emulators only | public dev keys | **unset** | — |
| `AUTO_PROVISION` | Create the Cosmos and blob containers on start | `true` | `false` | no |
| `AZURE_CLIENT_ID` etc. | Managed identity | your `az login` | injected by workload identity | — |

There are no `NEXT_PUBLIC_*` variables, so one Docker image runs in every environment.

## Deviations from PLAN.md

- **Repo layout:** the app lives at the repository root, not in `chat-webapp/`.
- **Writes over HTTPS:** clients don't send messages over the socket. The same `sendMessage()` could later serve a Web PubSub webhook; until then there's no CloudEvents handler to secure.
- **`sendToUser` per member, not groups:** membership changes take effect immediately, with no group bookkeeping. For very large groups, switch to `group().sendToAll`.
- **No Redis room-permission cache or outbox yet:** authorization reads PostgreSQL directly; the indexes keep that cheap at this scale.
- **Better Auth database sessions, not JWTs:** this is the plan's documented fallback.

## Cleanup candidates

- Attachments uploaded but never sent stay in the `attachment` table and the blob container. A periodic job could delete rows with `message_id IS NULL` older than a day.
- Blobs of deleted messages are kept as evidence for reports.
