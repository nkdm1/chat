// Creates the Cosmos database/container and the blob container on the local
// emulators. Never run against Azure: OpenTofu owns those resources there.
import { blobs } from "../src/server/blob";
import { CosmosMessageStore } from "../src/server/messages/cosmos";

async function main() {
  await new CosmosMessageStore().init();
  await blobs().createIfNotExists();
  console.log("Cosmos container and blob container are ready.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
