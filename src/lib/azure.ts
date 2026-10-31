import { DefaultAzureCredential } from "@azure/identity";

// One credential for every Azure SDK client. Locally it uses your `az login`;
// on AKS, workload identity injects AZURE_CLIENT_ID / AZURE_TENANT_ID /
// AZURE_FEDERATED_TOKEN_FILE, so the app needs no extra configuration.
let credential: DefaultAzureCredential | undefined;

export function azureCredential() {
  credential ??= new DefaultAzureCredential();
  return credential;
}
