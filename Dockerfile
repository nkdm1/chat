# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
# Placeholders so env validation passes while Next collects routes. Not used at runtime.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-only-build-only-build-only-build \
    BETTER_AUTH_URL=http://localhost:3000 \
    SMTP_HOST=localhost SMTP_PORT=1025 MAIL_FROM=build@localhost \
    COSMOS_ENDPOINT=https://build.invalid WEBPUBSUB_ENDPOINT=https://build.invalid \
    AZURE_STORAGE_ACCOUNT_URL=https://build.invalid
RUN pnpm build

# One-shot job: applies the SQL migrations, then exits.
FROM deps AS migrator
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
CMD ["pnpm", "exec", "drizzle-kit", "migrate"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
