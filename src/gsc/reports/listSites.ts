import { GscClient } from "../client.js";

export async function listSites(client: GscClient) {
  const sites = await client.listSites();
  const rows = sites.map((entry) => ({
    siteUrl: entry.siteUrl ?? "(unknown)",
    permissionLevel: entry.permissionLevel ?? "(unknown)"
  }));

  const summary = rows.length === 0
    ? "No Search Console sites accessible to this service account."
    : `${rows.length} sites accessible. First: ${rows[0].siteUrl} (${rows[0].permissionLevel}).`;

  const preview = rows.length === 0
    ? "No rows returned."
    : `Showing ${rows.length} of ${rows.length} rows.\n${rows
        .map((row, index) => `${index + 1}. ${row.siteUrl} | ${row.permissionLevel}`)
        .join("\n")}`;

  return {
    summary,
    preview,
    rowCount: rows.length,
    rows
  };
}
