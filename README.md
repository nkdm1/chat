# chat

An online chat web app. You sign in, add friends with a 6-digit friend code, and talk to them in direct messages or groups, live.

Built for *Bezpieczeństwo Serwerów i Aplikacji Webowych*: Lab 1 (accounts, email verification, 2FA) and Lab 2 (the chat).

## Features

- **Friends:** a personal 6-digit code (copy or regenerate), requests, accept/decline, presence.
- **Messaging:** direct messages and groups (owner can rename, add and kick members; anyone can leave).
- **Live updates:** messages, typing indicator, "Seen" receipts, reactions, edit and delete.
- **Message tools:** reply/quote with jump-to-message, @mentions with autocomplete, an emoji picker, and search within a conversation.
- **Attachments:** images, PDF and TXT, up to 5 MB, checked by content. Paste or drag & drop; images open in a lightbox.
- **Notifications:** unread badges, an "@" badge, the tab title, a sound, desktop notifications, and per-conversation mute.
- **Moderation:** users report messages; the admin panel has metrics, a report queue, ban/unban, roles and an audit log.

How it's built, and the security controls, are described in [docs/architecture.md](docs/architecture.md). The guide for moving to Azure is [docs/azure-deployment.md](docs/azure-deployment.md).

## Run locally

You need Node.js 22+, [pnpm](https://pnpm.io) 11 and Docker.

```bash
cp .env.example .env              # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d db mailpit redis azurite cosmos webpubsub
pnpm install
pnpm db:migrate                   # PostgreSQL tables
pnpm cosmos:init                  # Cosmos container + blob container (emulators only)
pnpm dev                          # http://localhost:3000
```

The services are local stand-ins for Azure, used through the same Azure SDKs:

| Service | Purpose | UI |
|---|---|---|
| `cosmos` | messages (Cosmos DB emulator) | Data Explorer on http://localhost:1234 |
| `azurite` | attachments (Blob Storage emulator) | – |
| `webpubsub` | realtime (Web PubSub emulator; the first build takes a minute) | – |
| `redis` | rate limits, presence, typing, unread counters | – |
| `mailpit` | emails | http://localhost:8025 (click the verification link here) |

To become an admin, sign up, then run `pnpm admin:grant you@example.com` and open `/admin`.

Everything can also run in Docker: `docker compose up --build`.

## Checks

```bash
pnpm check        # Biome (formatting, imports)
pnpm lint         # oxlint (type-aware)
pnpm typecheck
pnpm test         # needs: docker compose up -d db redis azurite (cosmos optional)
```

## Manual test checklist

1. Sign up two users (two browser profiles), verify via Mailpit.
2. Exchange friend codes, accept, open the DM and chat. Check the typing indicator and "Seen".
3. Send `<script>alert(1)</script>`: the tag is stripped and the text renders as plain text.
4. React, reply, then jump to the quoted message. Edit (the up arrow edits your last message), delete.
5. Paste a screenshot (Ctrl+V); a renamed `.exe` → `.png` is rejected.
6. Create a group with a third user, @mention them, then kick them: they're redirected out.
7. Mute a conversation, background the tab, and check the tab title and notifications.
8. Report a message, resolve it in `/admin` with a ban, and check that the user is logged out.
9. `docker compose stop webpubsub`: the UI shows "Reconnecting…" and polls; start it again and it reconnects.
10. `docker compose stop redis`: chat still works, and spamming still returns 429.
