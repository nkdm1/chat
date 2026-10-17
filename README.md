# chat

An online chat web app. Users sign in, add friends with a personal friend code, and message them.

This repository is the **Lab 1** deliverable for *Bezpieczeństwo Serwerów i Aplikacji Webowych*
(Server and Web Application Security): the application skeleton with a secure authentication
layer. The chat itself comes later.

## Vision

- Sign in and get a personal **friend code**.
- Add a friend by entering their code (the other person accepts the request).
- 1:1 conversations between friends.
- Redis for the things that don't belong in Postgres: presence, typing indicators,
  realtime fan-out and rate-limit storage.

## Status

| Stage | Scope | State |
|---|---|---|
| **1 (this PR)** | Auth skeleton: sign up, sign in, sign out, protected page | done |
| 1 | E-mail verification, password reset, two-factor (TOTP + backup codes) | done |
| 1 | Docker, migrations, tests, CI, security headers | done |
| 2 | Friend codes and friend requests (`friendship` table) | planned |
| 3 | Conversations and messages, realtime delivery | planned |
| 4 | Redis (presence, pub/sub, rate-limit storage) | planned |

After signing in you currently land on `/chat`, which says *"Chat will be implemented soon."*
and has a log out button. There are deliberately no friends or chat tables yet.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript), React 19 |
| Styling / UI | Tailwind CSS v4, shadcn/ui (Radix), restyled |
| Auth | [Better Auth](https://www.better-auth.com) (cookie sessions, 2FA plugin) |
| Database | PostgreSQL 17 |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Validation | Zod (shared by client and server) |
| E-mail | Nodemailer, Mailpit in development |
| Tests | Vitest |
| Lint / format | Biome |
| Client data layer | TanStack Query (wired up, used from stage 2) |

## Quick start

Prerequisites: Node.js 22+ (24 recommended), [pnpm](https://pnpm.io), Docker.

```bash
cp .env.example .env
# put a real secret in .env:
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)

docker compose up -d db mailpit   # Postgres + Mailpit
pnpm install
pnpm db:migrate                   # apply SQL migrations
pnpm dev                          # http://localhost:3000
```

Sent e-mails (verification, password reset) show up in Mailpit: http://localhost:8025.

### Everything in Docker

```bash
docker compose up --build         # db, mailpit, migrations, app on http://localhost:3000
```

The `migrate` service applies the migrations and exits before `app` starts.
`BETTER_AUTH_SECRET` is read from `.env`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm check` | Biome lint + format check |
| `pnpm format` | Biome, apply fixes |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (needs Postgres, see below) |
| `pnpm db:generate` | Generate a migration from the Drizzle schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Browse the database |

## Features

- **Sign up** with username, e-mail and password (12 to 128 characters). Validated on the server.
- **E-mail verification:** an account can't sign in until the link in the e-mail is opened.
  The link signs the user in. Resend is available.
- **Sign in / sign out**, with generic error messages and rate limiting.
- **Forgot / reset password:** single-use link that expires after 30 minutes. A successful
  reset revokes every session. The "forgot" form answers the same way for unknown e-mails.
- **Two-factor authentication:** enable it under *Security* (account menu). Scan the QR code
  with an authenticator app (Aegis, 2FAS, Google Authenticator, 1Password...), confirm a code,
  and save the backup codes. Sign-in then asks for a code (or a backup code, each usable once).
  Disabling it and generating new backup codes require the password.
- **Protected pages:** `/chat` and `/settings/security`.

## Security notes

| Requirement | Implementation |
|---|---|
| Secure password hashing | scrypt (Better Auth default, memory-hard), per-password salt. Only the hash is stored (`account.password`). |
| Sessions | Opaque token in a cookie, stored server-side and revocable. Cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when `BETTER_AUTH_URL` is https. 24 h lifetime, refreshed hourly. |
| ORM | Drizzle. All queries are parameterized. |
| Server-side validation | Zod runs in a Better Auth hook before sign-up, so it can't be bypassed by calling the API directly. |
| CSRF | Origin validation against `trustedOrigins`, `SameSite=Lax` cookies, JSON-only mutations. The app is same-origin, so no CORS headers are sent. |
| Brute force | Better Auth rate limiting (database storage), tighter on mail-sending and 2FA endpoints, 2FA lockout after repeated failures. |
| Account enumeration | Generic sign-in errors; "forgot password" and verification mails are sent in the background so response time doesn't leak whether an account exists. |
| Mail links | Built from `BETTER_AUTH_URL`, never from the request `Host` header. |
| Headers | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production. |
| Authorization boundary | `src/proxy.ts` only checks that a cookie exists (fast redirect). Every protected page validates the session against the database via `requireSession()`. |
| Secrets | Only in `.env` (git-ignored). `src/lib/env.ts` fails fast when something is missing. |

Known trade-off: the CSP allows `'unsafe-inline'` scripts because Next.js injects inline bootstrap
code. A per-request nonce would tighten this.

## Tests

```bash
docker compose up -d db
pnpm test
```

Unit tests cover the validation schemas. Integration tests run against a real Postgres
(`chat_test`, created automatically, real migrations applied) and cover registration,
verification, login/logout, password reset and 2FA. Mail sending is mocked.

CI (`.github/workflows/ci.yml`) runs Biome, the typecheck and the tests on every push and PR.

## Project layout

```
src/
  app/
    (auth)/        sign-in, sign-up, verify-email, forgot/reset-password, two-factor
    (app)/         layout that requires a session; chat, settings/security
    api/auth/      Better Auth route handler
  components/      UI (components/ui is shadcn)
  db/schema/       Drizzle schema (Better Auth tables)
  lib/             auth config, env, mail, session helpers, validation
  proxy.ts         optimistic redirect for protected routes
drizzle/           generated SQL migrations
tests/             unit + integration
docs/              design decisions (for the course)
```

## Roadmap notes

- **Friends:** each user gets a short friend code. Entering it creates a pending request that the
  other user accepts. Pairs are stored once, in canonical order, so duplicates are impossible.
- **Chat:** conversations and messages in Postgres, realtime delivery over WebSocket or SSE.
- **Redis:** presence, typing indicators, pub/sub, and the rate-limit store.
