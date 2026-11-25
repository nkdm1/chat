# Agent Implementation Plan

> **Purpose:** An execution-oriented plan for coding agents. Follow phases in order, keep changes scoped, and run the listed checks. This document splits work into two separately ownable workstreams: (A) frontend + backend application and (B) Azure infrastructure in OpenTofu. Both integrate through the contracts below; app developers must not author production infra, and infra agents must not implement product behavior.
>
> **Architecture overview:** See [PLAN.md](PLAN.md). This agent plan and the high-level plan together are the current project plan; do not rely on `old-plan.md` unless reviewing historical context.

## 0. Repository facts and constraints

- Application code currently lives under `chat-webapp/` (not a top-level `frontend/` and `backend/` split).
- Existing application stack: Next.js 16, React 19, TypeScript, Better Auth, Drizzle ORM, PostgreSQL, pnpm, Vitest, and Biome. Node.js >=22, pnpm 11.
- Preserve the existing structure and conventions. Do not replace the app stack with generic React/Vue or introduce a second backend service unless a reviewed design decision requires it.
- Existing auth, schema, and UI behavior must be inspected before changes; reconcile the intended product with the current implementation rather than duplicating authentication systems.
- Azure target architecture: Azure Static Web Apps (SWA) for the Next.js frontend, AKS for backend API/workloads, PostgreSQL Flexible Server, Cosmos DB, Azure Managed Redis, Azure Web PubSub, ACS Email, OpenTofu, and GitHub Actions. SWA's generated workflow handles frontend build/deploy; backend images are stored in ACR. Next.js hybrid support is documented as preview, so verify the app's required features against the selected SWA mode.
- **Provide a dedicated Azure dev environment as the primary frontend/backend integration and test target.** Provision it incrementally with OpenTofu; do not wait for the full production infrastructure. Local fakes are appropriate for unit tests, but do not build/maintain a full Docker-based Azure substitute as the primary development runtime.
- No secrets, real email addresses, verification tokens, or production credentials in source control, fixtures, logs, screenshots, or test output.

## 1. Shared interface contract (agree before parallel implementation)

### Application-to-infrastructure contract

Maintain a checked-in, non-secret configuration reference (for example `chat-webapp/.env.example` and an infra outputs document) containing names, meanings, and local-development defaults only. Agree the final names with both teams before wiring deployments. Expected configuration categories:

- PostgreSQL connection endpoint/database and secure authentication method.
- ACS Email endpoint, verified sender address, and identity-based authentication configuration.
- Cosmos DB endpoint/database/container names and workload identity access.
- Redis endpoint/TLS/auth configuration supported by the chosen Azure configuration.
- Web PubSub endpoint/hub name and workload identity access.
- Public application origin, API origin/base path, and allowed CORS/origin settings if cross-origin.
- Runtime identity/workload identity identifiers and required role assignments.

Never put secret values in OpenTofu outputs, committed files, build args, or browser-visible configuration. Provide secrets at runtime using the deployment platform's secure mechanism. Managed identity is preferred for Azure resources where supported; PostgreSQL/Redis authentication and networking must be separately designed and documented.

### Browser/API contract (initial target; document actual paths/types in code)

- Registration: `POST /api/auth/sign-up` (or Better Auth's chosen endpoint), validates input and begins a pending/unverified account flow.
- Verification: `POST /api/auth/verify-email` or link-consumption route; token is short-lived and single-use.
- Resend: `POST /api/auth/resend-verification`; rate-limited and generic response.
- Session/authentication: preferred target is short-lived signed access JWT plus longer-lived opaque refresh/session token. Store only a hash of the refresh token in PostgreSQL; keep browser credentials in secure `HttpOnly` cookies. Verify access JWTs locally using trusted signing keys when feasible. This is conditional: first assess secure implementation with Better Auth and key management. If it is disproportionately complex or unsafe, explicitly retain the current Better Auth PostgreSQL-backed session lookup per request rather than shipping a fragile custom token scheme. Never accept a user ID as a substitute for authentication.
- JWT key management (only if implementing JWT access tokens): private signing key is server-only and preferably held/protected by Azure Key Vault; include `kid`, support overlapping old/new verification keys during planned rotation, and never expose private key material in browser config or logs. If Key Vault integration/rotation is too complex for the initial implementation, use the database-backed session fallback.
- Negotiate: authenticated request (prefer `POST /api/negotiate`) returns a short-lived Web PubSub client URL/token. Identity comes from the validated Better Auth session or, if the optional JWT design is adopted, a locally verified access JWT. Require verified/active account.
- Messaging: client events are schema-validated; trusted server/webhook derives sender from Web PubSub connection context, checks membership, persists, and publishes.
- Web PubSub webhook: configured callback path, CloudEvents validation, correct validation handshake, authentication/signature/network controls according to Azure configuration, idempotent processing.
- Mark read: authenticated route accepts a conversation and read position, verifies membership, writes the durable last-read position to PostgreSQL, then resets/reconciles that user's derived Redis unread counter.
- Errors: stable machine-readable error codes for client handling; generic registration/resend responses to avoid account enumeration.

Endpoint names above are targets, not a requirement to break existing Better Auth routes. Inspect and document the actual API shape, and update this contract before implementing if existing framework conventions require different paths.

### Data and event invariants

- PostgreSQL is authoritative for account/auth and relational membership data.
- Cosmos DB is authoritative for durable chat messages; partition by `/conversationId` and support ordered/paginated conversation history.
- Redis contains derived/cache data: cached per-user room permissions/available rooms, presence, typing, rate limiting, and unread counters. Presence/typing use TTLs; room-permission caches must be invalidated on every source relationship change and have a bounded TTL. PostgreSQL stores each user's durable last-read position; unread counters are derived/rebuildable Redis values.
- Do not trust browser-supplied sender IDs, membership claims, or arbitrary group names.
- Message processing must be idempotent across webhook retries; store before fan-out. Define recovery behavior for persisted-but-not-published and failed-persistence cases.
- Verification tokens are random, stored hashed, expire, and are consumed atomically once. A delivery error never verifies an account.
- Authentication and authorization are distinct: a valid session/JWT identifies the user; room membership is checked using the authorization service, with PostgreSQL as source of truth and Redis as a cache.
- Redis room-permission entries are invalidated/rebuilt when group membership or friendship changes. Persist the relationship change in PostgreSQL first; use reliable invalidation (preferably a transactional outbox) and define revocation guarantees/cache-failure behavior.
- For each successfully persisted message, increment unread counters for eligible recipients other than the sender exactly once. Persist/read the user's last-read position in PostgreSQL; Redis counters must be rebuildable from Cosmos messages after that position and reset/reconciled when the conversation is read.

# Workstream A — Frontend + Backend Application

Application agents own code under `chat-webapp/`, application tests/migrations, container packaging, and a runtime configuration contract. They do not provision or change Azure resources. Develop and test Azure integrations against the dedicated Azure dev environment. Keep small fakes for isolated unit tests, but do not build a parallel local Azure-service stack or make it the primary development path.

## A0. Reconnaissance and baseline

1. Read `chat-webapp/AGENTS.md`, `README.md`, `package.json`, auth configuration, database schema/migrations, routes, environment examples, Dockerfile, and tests.
2. Record current sign-up/sign-in/email verification/session behavior and identify gaps versus this plan. Reuse Better Auth and Drizzle where appropriate; do not add parallel auth tables/flows without need.
3. Run baseline `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm typecheck`, and `pnpm test`; note existing failures before edits.
4. Update only non-secret configuration names in `.env.example`; do not read, print, or commit actual `.env` values.

**Exit criteria:** concise gap analysis exists in the PR/agent report; no accidental secrets; baseline is known. Coordinate with Workstream B to obtain Azure dev environment access; end-to-end cloud integration uses real dev resources.

## A1. Authentication and ACS registration email

1. Define pending/verified account behavior consistent with Better Auth's capabilities and current schema. Use existing auth verification features if they satisfy requirements.
2. **Session/JWT decision gate:** document current Better Auth/PostgreSQL session behavior, then evaluate whether Better Auth can safely support the desired short-lived signed access JWT plus opaque refresh/session token. Do not assume Azure SDKs provide this feature. If feasible without replacing core auth unsafely, use secure `HttpOnly` cookies, hash refresh tokens in PostgreSQL, rotate refresh tokens, and verify access JWTs locally. Otherwise keep the existing PostgreSQL-backed Better Auth session lookup and document the decision. In either case, password login must verify a stored password hash in the backend.
3. If implementing JWT signing, define key generation/storage, `kid`, algorithm allowlist, expiry, issuer/audience checks, multi-instance verification, and rotation before coding. Prefer Azure Key Vault for private key protection if the integration can be safely delivered; if it materially delays or complicates a secure first implementation, choose the database-backed session fallback. Never commit static signing keys.
4. Implement email delivery against the shared Azure dev ACS resource. Use `@azure/communication-email`'s `EmailClient` and `@azure/identity`'s `DefaultAzureCredential`; call `EmailClient.beginSend(EmailMessage)` and await the returned poller's `pollUntilDone()`. Check result status and classify SDK errors. Keep email provider logic isolated; do not build a full local Azure/email emulator stack.
5. Configure ACS using environment/runtime identity settings; sender address must be verified. Never expose ACS credentials to client code.
6. Implement registration, verify, resend, expiry, and one-time token consumption. Store hashed tokens; avoid token leakage in logs/analytics. Apply rate limits and generic responses for registration/resend.
7. Delivery is asynchronous/retryable where possible. Ensure retries do not issue unlimited tokens or accidentally activate an account; document delivery-failure and resend behavior.
8. Write unit tests with a fake mail adapter and integration tests against Azure dev ACS for valid verification, invalid/expired/replayed token, generic duplicate-address response, rate limit, and provider failure. Do not send test mail to real users.

**Exit criteria:** only verified accounts can use protected chat capabilities; selected session/JWT design and email adapter are tested; unit tests require no Azure credentials, while Azure integration tests use the dedicated dev environment.

## A2. PostgreSQL schema and data access

1. Review current Drizzle schema and migration history before modifying.
2. Add/adjust user verification state and token persistence only if not already covered by Better Auth. Token values must be hashed and one-time/expiring.
3. Add relational conversation/group membership structures needed for authorization if absent.
4. Store a durable per-user/per-conversation last-read position in PostgreSQL; Redis unread counters are derived from this position and durable message records, not the source of truth.
5. Add an authenticated mark-read operation that persists the last-read position and then resets/reconciles the Redis counter.
6. Add indexes and constraints for lookup, uniqueness, expiry/cleanup, membership checks, and last-read lookups.
7. Generate migrations using the existing project workflow; review generated SQL. Do not edit applied migrations destructively.
8. Test migration and access logic against a disposable/local PostgreSQL instance where available.

**Exit criteria:** reproducible forward migration; schema prevents duplicate/inconsistent records; no plaintext token storage.

## A3. Chat API, persistence, and Web PubSub

1. Use official Azure SDKs where they are the appropriate supported data-plane clients (`@azure/web-pubsub`, `@azure/cosmos`, `@azure/communication-email`, `@azure/identity`). Use standard protocol clients for PostgreSQL/Redis (`ioredis` for Redis). Introduce typed service boundaries where useful, keeping handlers thin and domain logic testable.
2. Implement authenticated negotiation: derive the user from the session; require verified/active status; authorize hub/group scopes; return a short-lived client credential. For server-side token generation, use `@azure/web-pubsub`'s `WebPubSubServiceClient.getClientAccessToken({ userId, roles })`, constructed with the service endpoint, hub name, and workload identity credential. Never take `userId` at face value from query/body. Return `Cache-Control: no-store` because the resulting client URL is a bearer credential.
3. Implement Web PubSub webhook endpoint and CloudEvents validation/handshake. Validate event schema, trust boundaries, and connection-to-user mapping. Configure webhook authentication consistently with the infrastructure contract.
4. Validate message length/type/conversation ID, authorize conversation membership, assign or validate an idempotency key, persist to Cosmos DB using the official `@azure/cosmos` SDK (`CosmosClient`), update each eligible recipient's Redis unread counter exactly once (exclude sender), then publish to the correct group using `WebPubSubServiceClient.group(conversationId).sendToAll(message)`. Persist each user's last-read position in PostgreSQL; rebuild/reset the derived Redis count after reads or cache loss. Make counter updates retry-safe (e.g. deduplicate event IDs atomically) and define recovery if persistence succeeds but Redis or fan-out fails. Validate exact package APIs against installed SDK versions.
5. Implement ordered/paginated history reads with membership authorization. Avoid unbounded Cosmos queries.
6. Implement room authorization as a dedicated service. PostgreSQL is authoritative for friendships and group membership; Redis caches each user's accessible-room/permission data. On every membership-affecting operation (friend added/accepted/removed, group member added/removed/kicked), commit the canonical PostgreSQL change, then reliably invalidate/rebuild all affected users' cached room permissions. Prefer a transactional outbox so a process crash cannot silently lose invalidation; use bounded TTL as a safety net. Define whether a removal must take effect before the API acknowledges it, what to do if Redis is unavailable, and how active Web PubSub group membership is removed/reconciled. Do not trust client-provided room lists.
7. Add Redis integration for heartbeat-based presence with TTL (example target: heartbeat every 30 seconds, key TTL 60 seconds), typing indicator TTLs (example: 3–5 seconds), sliding-window or token-bucket rate limiting, and unread counters. Preserve the original `ioredis` client choice; use a shared `ioredis` connection and Redis protocol commands (for example `SET key value EX seconds` for TTLs and atomic/idempotent counter updates). Configure TLS and authentication according to the provisioned Azure Managed Redis SKU/mode. Do not assume Redis Entra authentication is automatic via `DefaultAzureCredential`. Gracefully handle Redis outage without treating ephemeral presence/counters as durable state.
8. Provide unit tests using fakes and Azure-dev integration tests for unauthorized user, unverified user, non-member, cache hit/miss, cache invalidation after add/remove, stale-cache/revocation behavior, Redis outage, unread counter increment-once/read-reset/rebuild, mark-read authorization, malformed CloudEvent, duplicate event, storage failure, and successful publish path.

**Exit criteria:** all routes enforce authentication/authorization; PostgreSQL remains the membership source of truth; Redis permission caches are invalidated for additions and removals; webhook processing is validated and idempotent; persistence precedes fan-out; unit tests run without Azure and cloud integration tests pass against the dedicated Azure dev environment.

## A4. Frontend flows

1. Preserve current Next.js design system/components and existing project conventions.
2. Implement sign-up, sign-in, verification-pending, verification result, resend, and error states. Do not disclose whether an email already has an account.
3. Connect to authenticated chat through the negotiation API; use `@azure/web-pubsub-client`'s `WebPubSubClient` with the returned short-lived client access URL (do not use a raw `WebSocket` unless a deliberately selected protocol requires it). Do not place service keys or long-lived tokens in the browser. Handle reconnect, expired credentials, offline state, and duplicate events.
4. Implement conversation list/history, send/receive UI, unread badges, and a mark-as-read action; reconcile counters from the backend rather than treating browser counts as authoritative. Use optimistic states only with clear reconciliation on failure.
5. Implement heartbeat only while appropriate (authenticated active connection); clean up timers/listeners on disconnect/unmount. Presence UI is best-effort.
6. Test important user journeys and accessibility/responsive states. Mock API/WebSocket/provider interactions in frontend tests.

**Exit criteria:** usable registration and chat paths; no direct Azure secret access from browser; connection lifecycle is cleaned up and tested.

## A5. Application packaging and delivery interface

1. Keep Docker image build reproducible, non-root where practical, and free of build-time credentials.
2. Add health/readiness behavior appropriate for AKS; readiness checks required dependencies without making transient optional Redis/email outages crash the process.
3. Document required runtime settings and migration/deploy ordering. Use graceful shutdown and structured, redacted logs.
4. Supply deployment manifests/Helm only if assigned to the application team; otherwise document image port, health paths, resources, and required settings for the infra team. Do not overlap ownership without agreement.
5. Keep the pipelines separate by responsibility, using the actual monorepo paths under `chat-webapp/` (inspect the repository workflow conventions; do not assume `/backend` and `/frontend` directories):
   - **Test workflow:** on pull requests, run frontend/backend lint, typecheck, tests, and build validation. Build/validate the backend Docker image but do not publish it.
   - **Backend image build workflow:** on merge to the default branch, build the backend image and publish an immutable/versioned tag (for example, commit SHA plus an optional release tag) to ACR. Authenticate with GitHub OIDC, not a long-lived Azure client secret. Do not deploy the image to AKS automatically; AKS rollout is manual.
   - **Frontend SWA workflow:** use the GitHub Actions workflow generated by Azure Static Web Apps, using the official `Azure/static-web-apps-deploy` action. PRs use preview environments and default-branch pushes deploy production. SWA builds and deploys directly; no separate frontend blob artifact is planned. Verify the supported Next.js 16 hybrid/static mode before relying on it.

**Exit criteria:** repeatable local build and runtime contract; application CI passes; infra team can deploy using documented outputs.

# Workstream B — Infrastructure (OpenTofu)

Infra agents own OpenTofu under `infra/` and Azure resource configuration/identity/networking/infra CI. They do not implement UI, auth, API behavior, or application DB migrations. Keep modules and environments aligned with repository conventions after inspecting existing files.

## B0. Discovery and design

1. Inspect existing `infra/` files, backend/state setup, provider versions, conventions, and GitHub workflows before writing resources. Do not assume the directory is empty or that remote state is configured.
2. Design a separate, isolated Azure dev environment as the first cloud deployment target. It must be safe for test users/data and accessible to frontend/backend developers; use a separate resource group and OpenTofu state from production.
3. Agree subscription/tenant, region, environment names, naming/tagging, network topology, DNS, TLS, cost constraints, resource SKU/availability, and ownership with the user/platform owner before high-impact provisioning.
4. Produce a resource/dependency diagram and application interface contract: endpoint/resource names, identities, role assignments, network access, and non-secret outputs.
5. Use Azure Static Web Apps for the frontend and AKS for the backend as the selected target. SWA's GitHub-connected workflow will build/deploy frontend code, with PR previews and default-branch production deployment. Next.js hybrid rendering is documented as preview, so verify the current Next.js 16 app's features and SWA constraints before relying on that mode; record any unsupported feature/blocker rather than silently switching the host.
6. Resolve managed Redis/ACS/Web PubSub/Cosmos SKU and regional availability before hard-coding resources.

**Exit criteria:** documented environment design, resource list, application config contract, and reviewed cost/security choices.

## B1. State, providers, and reusable structure

1. Configure remote OpenTofu state in a secured Azure Storage container with blob lease locking and restricted access; keep dev and production state isolated. State must not be committed.
2. Pin compatible Terraform/OpenTofu and AzureRM provider versions; declare required providers and versions.
3. Separate environments (e.g. dev/prod) and reusable modules only to the degree useful for this repo; do not over-generalize a single environment.
4. Add `.gitignore` coverage for local state, plans, credentials, and generated secret files. Add format/validate checks.

**Exit criteria:** safe state location and locking; reproducible `tofu init`, `fmt -check`, `validate`, and plan for non-production.

## B2. Azure resources and connectivity

Provision the approved dev set first, incrementally and with least privilege, then extend the reviewed design to production. Dev is a real Azure environment—not a mock stack—and should use real Azure endpoints/SDK integrations for services under development. It may omit production scale/HA controls if documented and safe:

1. Resource group, tags, diagnostics, and networking/private connectivity as required by the approved design.
2. Azure Container Registry (ACR) for versioned backend workload images built by GitHub Actions; the build pipeline publishes images, while rollout to AKS remains manual.
3. AKS with workload identity/OIDC issuer and network ingress/TLS design. Web PubSub owns persistent client connections, so backend pods remain stateless and do not require sticky sessions. Keep initial dev capacity simple; defer detailed HPA/KEDA policies until workload measurements/requirements justify them.
4. PostgreSQL Flexible Server, database, private access/firewall, backups, and secure authentication/network settings.
5. Cosmos DB account/database/container(s), `/conversationId` partition key for messages, and role assignments for workload identity.
6. Azure Managed Redis with TLS/private networking/auth mode selected for the chosen SKU; document supported identity/auth behavior.
7. Azure Web PubSub hub/service with workload identity permissions for server operations and configured webhook endpoint/auth controls.
8. ACS resource/email domain or verified sender configuration, sender DNS records where applicable, identity permissions, and clear note of manual verification/approval steps not safely automated by IaC.
9. Azure Static Web Apps for the frontend per the selected target; configure the frontend repository/build integration, PR preview and default-branch production environments, public origins, and API integration.

Do not output credentials or secret material. Export only non-secret values needed for app/deployment setup. Avoid broad roles; grant each workload identity minimum required data-plane permissions. Document any resources/roles that cannot safely be automated.

**Exit criteria:** plan is reviewed before apply; resources are private/restricted as intended; app identities have only required access; non-secret outputs documented.

## B3. Identity, CI/CD, and operations

1. Configure GitHub Actions OIDC federation for the backend image-publishing workflow to authenticate to Azure Container Registry; grant that identity only `AcrPush` on the target registry and do not use long-lived Azure client secrets. Grant the AKS image-pull identity `AcrPull`. SWA's generated deploy workflow uses its required deployment credential stored as a GitHub secret.
2. Configure AKS workload identity: Kubernetes service account to user-assigned managed identity mapping, federated credential, and scoped Azure role assignments.
3. Use separate identities/permissions for app runtime, CI image publishing, and human infrastructure operators. Human operators manually run reviewed OpenTofu deployments to dev/production using their Azure identity; never run infra apply from GitHub Actions. Backend image rollout to AKS is also manual via the chosen Kubernetes deployment process (`kubectl` or Helm after inspecting repo conventions).
4. Add an infra validation workflow that runs on pull requests and relevant pushes: `tofu fmt -check`, initialize with backend disabled, then `tofu validate`. It performs syntax/format checks only—no `tofu plan` and no `tofu apply`; no automated infra deployment or plan artifact/comment.
5. Configure diagnostics/metrics/logging, alerts for service health/capacity, backup/retention policies, and cost tags/budgets as agreed.
6. Document bootstrap order for remote state, identity federation, manual infra deployment, ACS sender verification, database migration, app image publication/manual AKS rollout, SWA deployment, and smoke tests.

**Exit criteria:** no committed credentials; CI validates infra without provisioning resources; backend image publishing uses OIDC; workload identity is verified end-to-end; manual deployment and operations steps are documented.

# 2. Cross-team integration and rollout

1. **Contract freeze:** teams agree config names, route/event shape, auth/session decision gate, Redis room-cache invalidation and unread-counter contracts, CORS/origin, webhook security, hosting target, resource naming, and deployment ownership.
2. **Dev foundation first:** infra team creates isolated remote state and provisions the minimum Azure dev resources needed to unblock ACS, PostgreSQL, Web PubSub, Redis, and Cosmos DB integration. This is incremental; it does not require the entire production topology.
3. **Application vertical slice:** app team develops locally or deploys to the dev host, connecting to shared Azure dev resources using Azure SDKs and scoped developer/workload identities. Unit tests use fakes; cross-service integration uses real Azure dev services.
4. **Service integration:** app team connects ACS, Web PubSub, Cosmos, Redis, and PostgreSQL using the agreed config; infra team resolves Azure access/networking without changing business logic.
5. **End-to-end test:** register -> receive verification email -> verify -> log in -> negotiate -> connect -> join authorized conversation -> send -> persist -> update recipient unread counters once -> fan out -> read history -> mark conversation read/reset counter -> add/remove friend or group member -> confirm Redis permission cache invalidation -> presence expiry.
6. **Failure/security tests:** duplicate webhook, invalid/expired access and refresh tokens if JWT flow is selected, session revocation behavior, unauthorized membership, stale-cache/revocation, Redis outage, service outage, rate limits, secret/log scan, and rollback/migration checks.
7. **Production readiness:** sender/domain verified; TLS/DNS/alerts/backups/access reviews complete; CI/CD approvals and recovery procedures tested.

## 3. Global agent rules and definition of done

- Work on one workstream at a time unless an agreed contract makes parallel changes safe. Report changed files, checks run, and blockers.
- Inspect before editing; follow `chat-webapp/AGENTS.md`; use existing code patterns. Avoid broad rewrites and unrelated cleanup.
- Never apply production OpenTofu changes, destroy resources, alter remote state, or change identity/RBAC scope without explicit human approval.
- Never run commands that print `.env` secrets. Do not commit `.env`, state files, plans, credentials, tokens, generated secrets, or real user data.
- Keep secrets server-side; redact logs; use least privilege; validate external data; make retries idempotent.
- Every feature includes appropriate unit/integration tests; update documentation and `.env.example` without values.
- Before completion run relevant checks: `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build` for application changes; `tofu fmt -check` and `tofu validate` for infra changes. A human may separately create/review a plan before manual apply; CI must not run `tofu plan` or `tofu apply`.
- Done means tests and checks pass or failures are reported accurately; security and failure paths are covered; the other team can consume the contract without needing undocumented assumptions.