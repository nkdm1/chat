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

How it's built: [docs/architecture.md](docs/architecture.md). Moving to Azure: [docs/azure-deployment.md](docs/azure-deployment.md).

## Requirements

| Tool | Needed for |
|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running) | Always |
| `openssl` (preinstalled on macOS/Linux) | Generating the auth secret |
| Node.js 22+ and [pnpm](https://pnpm.io) 11 | Dev mode, tests, `pnpm admin:grant` |

Ports used on your machine: `3000` (app), `5432`, `6379`, `1025`, `8025`, `8081`, `1234`, `8085`, `10000`. Stop anything else listening on them first.

## Option A: run everything in Docker (simplest)

The app and all its services run as containers. No Node.js needed.

### First run

```bash
git clone git@github.com:nkdm1/web-sec.git
cd web-sec
cp .env.example .env
openssl rand -base64 32           # copy the output into .env as BETTER_AUTH_SECRET=...
docker compose up -d --build      # first build takes a few minutes
```

Then:

1. Wait about 30 seconds for the Cosmos emulator to boot. `curl http://localhost:3000/api/ready` returns `"status":"ready"` once everything is up.
2. Open http://localhost:3000 and sign up.
3. Open Mailpit at http://localhost:8025 and click the verification link.

Database migrations run automatically (the `migrate` container), and the Cosmos and blob containers are created on first use. There's nothing else to set up.

### Stop and start again

```bash
docker compose down               # stop and remove the containers; your data is kept
docker compose up -d              # start again (no rebuild)
```

`docker compose stop` / `docker compose start` also works and is slightly faster, but `down` + `up` is the reliable way to get a clean restart.

### After pulling new code

```bash
docker compose up -d --build      # rebuilds the app image and applies new migrations
```

### Reset everything (wipe all data)

```bash
docker compose down -v            # -v also deletes the volumes: users, messages, attachments
docker compose up -d --build
```

### Useful commands

```bash
docker compose ps                 # what's running
docker compose logs -f app        # follow the app's logs (Ctrl+C stops following, not the app)
docker compose restart app        # restart only the app
```

## Option B: dev mode (hot reload)

The services run in Docker; the Next.js app runs on your machine, so code changes show up instantly.

### First run

```bash
cp .env.example .env
openssl rand -base64 32                                       # paste into .env as BETTER_AUTH_SECRET=...
docker compose up -d db mailpit redis azurite cosmos webpubsub
pnpm install
pnpm db:migrate                   # PostgreSQL tables
pnpm cosmos:init                  # Cosmos + blob containers (fails if Cosmos is still booting: wait and retry)
pnpm dev                          # http://localhost:3000
```

### Stop and start again

```bash
# Ctrl+C in the terminal running pnpm dev, then:
docker compose down               # stop the services; data is kept

# next time:
docker compose up -d db mailpit redis azurite cosmos webpubsub
pnpm dev
```

After pulling new code, run `pnpm install` and `pnpm db:migrate` before `pnpm dev`.

If you used Option A before, the `app` container holds port 3000. Run `docker compose stop app` first (or `docker compose down`, then start only the services as above).

## Become an admin

Sign up, then (needs Node.js and pnpm; works with both options because PostgreSQL is exposed on `localhost:5432`):

```bash
pnpm install                      # once
pnpm admin:grant you@example.com
```

Refresh the page (roles are read live) and open http://localhost:3000/admin. Further admins can be promoted from the admin panel.

## Local services

They are local stand-ins for Azure, used through the same Azure SDKs:

| Service | Purpose | UI |
|---|---|---|
| `db` | accounts, friends, groups (PostgreSQL) | – |
| `cosmos` | messages (Cosmos DB emulator) | Data Explorer on http://localhost:1234 |
| `azurite` | attachments (Blob Storage emulator) | – |
| `webpubsub` | realtime (Web PubSub emulator; the first build takes a minute) | – |
| `redis` | rate limits, presence, typing, unread counters | – |
| `mailpit` | emails | http://localhost:8025 |

## Troubleshooting

| Problem | Fix |
|---|---|
| `set BETTER_AUTH_SECRET in .env` | `.env` is missing or the secret is empty. See "First run". |
| `port is already allocated` / `EADDRINUSE :3000` | Something else uses the port. Stop it, or `docker compose stop app` if `pnpm dev` is what you want. |
| `/api/ready` says `cosmos: down`, or sending messages returns 503 | The Cosmos emulator is still booting. Wait a minute; check `docker compose logs cosmos`. |
| No verification email | Look in Mailpit (http://localhost:8025), not your real inbox. |
| The UI shows "Reconnecting…" | Web PubSub is down: `docker compose up -d webpubsub`. Messages still arrive via polling. |
| Data looks broken after big schema changes | Reset: `docker compose down -v`, then follow "First run" again. |
| `pnpm admin:grant` says "No user with email" | Sign up with that email first. |

## Checks

```bash
pnpm check        # Biome (formatting, imports)
pnpm lint         # oxlint (type-aware)
pnpm typecheck
pnpm test         # needs: docker compose up -d db azurite
```

Tests use a separate `chat_test` database, so they don't touch your local data.

## Manual test checklist

1. Sign up two users (two browser profiles), verify via Mailpit.
2. Exchange friend codes, accept, open the DM and chat. Check the typing indicator and "Seen".
3. Send `<script>alert(1)</script>`: the tag is stripped and the text renders as plain text.
4. React, reply, then jump to the quoted message. Edit (the up arrow edits your last message), delete.
5. Paste a screenshot (Ctrl+V); a renamed `.exe` → `.png` is rejected.
6. Create a group with a third user, @mention them, then kick them: they're redirected out.
7. Mute a conversation, background the tab, and check the tab title and notifications.
8. Report a message, resolve it in `/admin` with a ban, and check that the user is logged out.
9. `docker compose stop webpubsub`: the UI shows "Reconnecting…" and polls; `docker compose start webpubsub` and it reconnects.
10. `docker compose stop redis`: chat still works, and spamming still returns 429.
