# chat

An online chat web app. You sign in, add friends with a personal friend code, and talk to them.

Built as the Lab 1 project for *Bezpieczeństwo Serwerów i Aplikacji Webowych*.

## Idea

- Every user has a personal **friend code**. Entering a friend's code sends them a friend request.
- Once accepted, you can chat with that friend.
- Later, Redis will hold the extra chat data (presence, realtime delivery).

## Run locally

You need Node.js 22+, [pnpm](https://pnpm.io) 11 and Docker.

```bash
cp .env.example .env
```

Set `BETTER_AUTH_SECRET` in `.env` to a random value (`openssl rand -base64 32`). Then:

```bash
docker compose up -d db mailpit   # PostgreSQL and a local mail catcher
pnpm install
pnpm db:migrate                   # create the database tables
pnpm dev                          # http://localhost:3000
```

The app sends real-looking e-mails (account verification, password reset), but locally they all
land in Mailpit instead: open http://localhost:8025 to read them. You must click the verification
link there before you can sign in.

### Or run everything in Docker

```bash
docker compose up --build         # http://localhost:3000
```

### Tests

```bash
docker compose up -d db
pnpm test
```
