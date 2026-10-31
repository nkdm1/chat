# Architecture

One Next.js app (UI + REST API) backed by Azure services. Locally those services are emulators in docker-compose, reached through the **same Azure SDKs**, so moving to Azure changes configuration, not code ([azure-deployment.md](azure-deployment.md)).

```
browser ──HTTPS (all writes)──▶ Next.js API ──▶ PostgreSQL   accounts, friends, groups, reactions, reports
   ▲                               │       ├──▶ Cosmos DB    messages
   │                               │       ├──▶ Blob Storage attachments
   │                               │       └──▶ Redis        rate limits, presence, typing, unread
   └──WebSocket (receive only)── Web PubSub ◀── sendToUser
```

## Components

| Concern | Local | Azure | Code |
|---|---|---|---|
| Accounts, friendships, groups, read positions, reactions, reports | PostgreSQL 17 | PostgreSQL Flexible Server | Drizzle, `src/db/schema` |
| Messages | Cosmos DB emulator | Cosmos DB (NoSQL) | `src/server/messages` |
| Attachments | Azurite | Blob Storage | `src/server/blob.ts` |
| Realtime | Web PubSub emulator | Web PubSub | `src/server/realtime.ts` |
| Rate limits, presence, typing, unread counters | Redis 7 | Azure Managed Redis | `src/server/redis.ts` |
| Email | Mailpit | Communication Services | `src/lib/email.ts` |

## How a message is sent

1. The browser calls `POST /api/conversations/:id/messages`. Every handler is wrapped in `withUser` (`src/server/http.ts`): verified, non-banned session; `Origin` check on writes (CSRF); 16 KB body cap; rate limit; errors as `{ error: { code, message } }`.
2. The body is validated (zod), sanitized (`sanitize-html`), and the sender's membership is checked in PostgreSQL.
3. The message is stored in Cosmos, then pushed to each member with Web PubSub `sendToUser`.
4. Browsers only **receive** over the socket. They get a 5-minute client URL from `POST /api/negotiate`, with the user id taken from the session and no send permissions. If the socket is down, the UI polls every 15 s.

**Cosmos details:** container `messages`, partition key `/conversationId`, so every query is single-partition and sorted by one field (`sortKey = createdAt_id`). The message id is `sha256(senderId:clientMessageId)`, which makes retries idempotent (409 returns the stored message). Edits and deletes use ETags; deletes are soft.

## When a service is down

| Down | Effect |
|---|---|
| Redis | Rate limits, presence and typing fall back to in-process memory; unread counts are rebuilt from Cosmos. |
| Web PubSub | Messages are still stored; the UI shows "Reconnecting…" and polls. |
| Cosmos | Sending and history return `503 STORE_UNAVAILABLE`; everything else works. |

`GET /api/ready` reports each service; only PostgreSQL and Cosmos make it fail.

## Security controls

| Control | Where |
|---|---|
| Validation | `src/lib/validation.ts` (zod), re-checked after sanitizing |
| HTML sanitization | All tags stripped; rendered as React text only |
| Rate limits | `src/server/rate-limit.ts` (Redis sliding window): messages 10/10 s, friend codes 5/min and 30/day, uploads 10/min, reports 10/h, search 30/min, other writes 120/min |
| Size limits | 2000-char messages, 16 KB JSON, 5 MB files, 4 attachments per message, 50 members per group |
| Attachments | Extension allowlist + magic-byte check; SVG/HTML rejected; random blob names; served via the API with `nosniff` and `CSP: sandbox` |
| Authorization | Non-members get 404; DMs need an active friendship; groups only contain friends |
| CSP | Per request in `src/proxy.ts`, with a script nonce |
| Moderation | Reports snapshot the message; admins see only reported messages; admin actions are audited; bans revoke sessions and close sockets |

## API

All routes are under `/api`: JSON, same-origin, session cookies.

| Area | Routes |
|---|---|
| Friend code | `GET /me/friend-code`, `POST /me/friend-code/regenerate` |
| Friends | `GET /friends`, `POST /friends/requests {code}`, `POST /friends/requests/:id/accept`, `DELETE /friends/requests/:id`, `DELETE /friends/:userId` |
| Conversations | `GET\|POST /conversations`, `POST /conversations/direct {userId}`, `GET\|PATCH /conversations/:id`, `POST /conversations/:id/members`, `DELETE /conversations/:id/members/:userId`, `PATCH /conversations/:id/membership {mutedFor}`, `POST /conversations/:id/read`, `POST /conversations/:id/typing` |
| Messages | `GET\|POST /conversations/:id/messages`, `GET /conversations/:id/search?q=`, `PATCH\|DELETE /messages/:id`, `POST /messages/:id/reactions`, `POST /messages/:id/report` |
| Attachments | `POST /conversations/:id/attachments` (multipart), `GET /attachments/:id` |
| Realtime | `POST /negotiate`, `POST /presence/heartbeat` |
| Admin | `GET /admin/metrics`, `GET\|POST /admin/reports[/:id]`, `GET\|POST /admin/users[/:id]`, `GET /admin/audit` |
| Health | `GET /health` (liveness), `GET /ready` (readiness) |

Realtime events (`type` field): `message.*`, `typing`, `conversation.*`, `friend.*`, `presence`.

## Configuration

`src/lib/env.ts` is the only reader of `process.env` and refuses to start if something is missing. Every variable is listed with comments in [.env.example](../.env.example); the Azure values are in [azure-deployment.md](azure-deployment.md). There are no `NEXT_PUBLIC_*` variables, so one Docker image runs everywhere.

## Known limitations and deviations from PLAN.md

- The app lives at the repository root, not in `chat-webapp/`.
- Clients don't send over the socket; all writes go through HTTPS.
- Pushes use `sendToUser` per member rather than Web PubSub groups (simpler; switch for very large groups).
- No Redis permission cache or outbox: authorization reads PostgreSQL directly.
- Better Auth database sessions instead of JWTs (the plan's documented fallback).
- Attachments uploaded but never sent are not cleaned up yet; blobs of deleted messages are kept as report evidence.
