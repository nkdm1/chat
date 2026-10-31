// Creates the Cosmos database/container and the blob container on the local
// emulators. Never run against Azure: OpenTofu owns those resources there.
import { blobs } from "../src/server/blob";
import { CosmosMessageStore } from "../src/server/messages/cosmos";

await new CosmosMessageStore().init();
await blobs().createIfNotExists();
console.log("Cosmos container and blob container are ready.");
process.exit(0);
