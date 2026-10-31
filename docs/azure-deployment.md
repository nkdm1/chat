# Moving the chat app to Azure

The app is built to run in Azure without code changes: you only change config.
Locally it talks to emulators; in Azure it talks to the real services.

## 1. What runs where

| Local (docker-compose) | Azure                              | How the app connects in Azure |
| ---------------------- | ---------------------------------- | ----------------------------- |
| Postgres               | PostgreSQL Flexible Server         | `DATABASE_URL` (secret)       |
| Cosmos emulator        | Cosmos DB (NoSQL)                  | endpoint + managed identity   |
| Azurite                | Storage Account (Blob)             | endpoint + managed identity   |
| Web PubSub emulator    | Web PubSub                         | endpoint + managed identity   |
| Redis                  | Azure Managed Redis                | `REDIS_URL` (secret)          |
| Mailpit                | Communication Services (Email)     | endpoint + managed identity   |
| `pnpm dev`             | AKS (one Docker image, port 3000)  | –                             |

Simplest path: run the whole Next.js app (UI + API) on AKS behind one HTTPS domain.
SWA is optional. If you use it, keep one origin (route `/api` to AKS), otherwise login cookies break.

## 2. Create the resources (OpenTofu)

Use **fixed names per environment** (e.g. `chat-dev-cosmos`). Endpoints come from names, so URLs survive destroy/recreate.

- **Cosmos DB**: database `chat`, container `messages`, partition key `/conversationId`, default indexing.
- **Storage**: private blob container `attachments`.
- **Web PubSub**: hub `chat`, no event handlers needed.
- **PostgreSQL**: database `chat`, SSL required.
- **Redis**: TLS on.
- **Communication Services + Email**: verify the sender domain (manual DNS step).
- **Key Vault**, **ACR**, **AKS** with OIDC issuer + workload identity enabled.

Key Vault keeps deleted names for a while (soft-delete): purge it, or keep the vault in a permanent resource group.

## 3. Give the app an identity

1. Create a user-assigned managed identity `chat-app`.
2. Add a federated credential for the Kubernetes service account `chat/chat-app`.
3. Assign roles to the identity:

| Resource   | Role                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| Cosmos DB  | Cosmos DB Built-in Data Contributor (data-plane `sqlRoleAssignment`, not normal RBAC)  |
| Storage    | Storage Blob Data Contributor (container scope)                                        |
| Web PubSub | Web PubSub Service Owner                                                               |
| ACS        | Role that allows sending email (check the current ACS Entra docs)                      |
| Key Vault  | Key Vault Secrets User (used by the CSI driver)                                        |
| ACR        | AcrPull for the AKS kubelet identity                                                   |

## 4. Secrets → Key Vault

Store these and mount them into the pod with the Secrets Store CSI Driver (synced to a Kubernetes Secret, used via `envFrom`):

- `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
- `DATABASE_URL`: `postgres://user:pass@<name>.postgres.database.azure.com:5432/chat?sslmode=require`
- `REDIS_URL`: `rediss://:<key>@<host>:10000`
- `SMTP_PASS` (only if you keep SMTP instead of ACS)

## 5. Config → ConfigMap

Write these from `tofu output` into a ConfigMap `chat-config` (same manual apply, or a small script), used via `envFrom`:

```env
BETTER_AUTH_URL=https://chat.example.com
MAIL_FROM=chat <no-reply@your-verified-domain>
EMAIL_PROVIDER=acs
ACS_ENDPOINT=https://chat-dev-acs.communication.azure.com
ACS_SENDER_ADDRESS=no-reply@your-verified-domain
COSMOS_ENDPOINT=https://chat-dev-cosmos.documents.azure.com:443/
COSMOS_DATABASE=chat
COSMOS_MESSAGES_CONTAINER=messages
AZURE_STORAGE_ACCOUNT_URL=https://chatdevst.blob.core.windows.net
AZURE_STORAGE_CONTAINER=attachments
WEBPUBSUB_ENDPOINT=https://chat-dev-wps.webpubsub.azure.com
WEBPUBSUB_HUB=chat
WEBPUBSUB_CLIENT_ORIGIN=wss://chat-dev-wps.webpubsub.azure.com
AUTO_PROVISION=false
```

Leave every `*_CONNECTION_STRING` unset in Azure. Those are for local emulators only.
The app validates all config on startup and refuses to start if something is missing.
`AZURE_CLIENT_ID` etc. are injected by workload identity; you don't set them.

## 6. Deploy

1. Build and push: `docker build --target runner -t <acr>.azurecr.io/chat:<git-sha> .`
2. Migrate the DB: run the `migrator` image target once as a Kubernetes Job (same `DATABASE_URL`).
3. Deploy the app: a Deployment with `serviceAccountName: chat-app`, the label `azure.workload.identity/use: "true"`, `envFrom` the ConfigMap + Secret, port 3000.
   - Liveness probe: `GET /api/health`. Readiness probe: `GET /api/ready`.
4. Ingress with TLS on your domain. The domain must equal `BETTER_AUTH_URL`.
5. After a config change: `kubectl rollout restart deployment/chat`.

## 7. Smoke test

- [ ] `/api/ready` returns 200 (all of postgres, cosmos, redis, webpubsub `ok`)
- [ ] Sign up → verification email arrives → log in
- [ ] Two users add each other by friend code
- [ ] Messages appear live in both browsers (Web PubSub)
- [ ] Message visible in Cosmos Data Explorer in the portal
- [ ] Upload an image → it's in the `attachments` container
- [ ] Grant admin: `pnpm admin:grant you@example.com` (run as a one-off Job / `kubectl exec`)

## Don'ts

- Don't run `pnpm cosmos:init` or set `AUTO_PROVISION=true` in Azure. OpenTofu creates the containers.
- Don't put access keys in the ConfigMap or the image. Use managed identity, and Key Vault for the secrets.
- Don't give CI read access to tfstate (it contains secrets).
- Don't add `NEXT_PUBLIC_*` variables. They get frozen at build time, and the same image must work in every environment.
