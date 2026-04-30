import { createGscClient } from "../gsc/client.js";
import { getTopQueries } from "../gsc/reports/topQueries.js";
import { getTopPages } from "../gsc/reports/topPages.js";

async function main() {
  const client = createGscClient();

  console.log("=== top_queries (last_28_days, top 5) ===");
  const queries = await getTopQueries(client, { limit: 5 } as any);
  console.log(queries.summary);
  console.log(queries.preview);
  console.log("");

  console.log("=== top_pages (last_28_days, top 5) ===");
  const pages = await getTopPages(client, { limit: 5 } as any);
  console.log(pages.summary);
  console.log(pages.preview);
}

main().catch((error) => {
  console.error("smokeTest failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
