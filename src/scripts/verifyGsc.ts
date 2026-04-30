import { createGscClient } from "../gsc/client.js";
import { listSites } from "../gsc/reports/listSites.js";

async function main() {
  const client = createGscClient();
  const result = await listSites(client);
  console.log(result.summary);
  console.log("");
  console.log(result.preview);
}

main().catch((error) => {
  console.error("verifyGsc failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
