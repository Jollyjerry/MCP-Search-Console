import { z } from "zod";

import { GscClient, resolveSiteUrl } from "../client.js";

export const listSitemapsInputSchema = z.object({
  siteUrl: z.string().min(1).optional()
});

export type ListSitemapsInput = z.infer<typeof listSitemapsInputSchema>;

export async function listSitemaps(client: GscClient, rawInput: ListSitemapsInput) {
  const input = listSitemapsInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const sitemaps = await client.listSitemaps(siteUrl);

  const rows = sitemaps.map((entry) => ({
    path: entry.path ?? "(unknown)",
    type: entry.type ?? null,
    isPending: entry.isPending ?? false,
    isSitemapsIndex: entry.isSitemapsIndex ?? false,
    lastSubmitted: entry.lastSubmitted ?? null,
    lastDownloaded: entry.lastDownloaded ?? null,
    warnings: Number(entry.warnings ?? 0),
    errors: Number(entry.errors ?? 0),
    contents: entry.contents ?? []
  }));

  const totalErrors = rows.reduce((s, r) => s + r.errors, 0);
  const totalWarnings = rows.reduce((s, r) => s + r.warnings, 0);

  const summary = rows.length === 0
    ? `No sitemaps submitted for ${siteUrl}.`
    : `${rows.length} sitemap${rows.length === 1 ? "" : "s"} for ${siteUrl}: ${totalErrors} total errors, ${totalWarnings} total warnings. Most recent fetch: ${rows.map((r) => r.lastDownloaded).filter(Boolean).sort().slice(-1)[0] ?? "(never)"}.`;

  const preview = rows.length === 0
    ? "No rows returned."
    : rows
        .map((row, index) => {
          const lines = [
            `${index + 1}. ${row.path}${row.isSitemapsIndex ? " (index)" : ""}${row.isPending ? " ⏳ pending" : ""}`,
            `     type: ${row.type ?? "(unknown)"} | submitted: ${row.lastSubmitted ?? "(unknown)"} | last fetch: ${row.lastDownloaded ?? "(never)"}`,
            `     errors: ${row.errors} | warnings: ${row.warnings}`
          ];
          if (row.contents.length > 0) {
            for (const content of row.contents) {
              lines.push(`     ${content.type}: ${content.submitted ?? "?"} submitted, ${content.indexed ?? "?"} indexed`);
            }
          }
          return lines.join("\n");
        })
        .join("\n");

  return {
    summary,
    preview,
    siteUrl,
    rowCount: rows.length,
    totals: { errors: totalErrors, warnings: totalWarnings },
    rows,
    warnings: [] as string[]
  };
}
