import { z } from "zod";

import { normalizeDateRange } from "../../utils/dateRanges.js";
import { GscClient, resolveSiteUrl } from "../client.js";

const presetEnum = z.enum([
  "last_7_days",
  "last_28_days",
  "last_30_days",
  "last_90_days",
  "last_365_days",
  "last_16_months"
]);

export const topPagesInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(1000).default(25),
    sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
    searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all"]).default("final"),
    pageContains: z.string().min(1).optional(),
    countryFilter: z.string().length(3).optional(),
    deviceFilter: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional()
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type TopPagesInput = z.infer<typeof topPagesInputSchema>;

export async function getTopPages(client: GscClient, rawInput: TopPagesInput) {
  const input = topPagesInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const dateRange = normalizeDateRange({
    preset: input.preset,
    startDate: input.startDate,
    endDate: input.endDate
  });

  const filters: any[] = [];
  if (input.pageContains) {
    filters.push({ dimension: "page", operator: "contains", expression: input.pageContains });
  }
  if (input.countryFilter) {
    filters.push({ dimension: "country", operator: "equals", expression: input.countryFilter.toLowerCase() });
  }
  if (input.deviceFilter) {
    filters.push({ dimension: "device", operator: "equals", expression: input.deviceFilter });
  }
  const dimensionFilterGroups = filters.length > 0 ? [{ groupType: "and", filters }] : undefined;

  const data = await client.query({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ["page"],
    rowLimit: input.limit,
    searchType: input.searchType,
    dataState: input.dataState,
    dimensionFilterGroups
  });

  const rows = (data.rows ?? []).map((row) => ({
    page: row.keys?.[0] ?? "(not set)",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  }));

  const sorted = [...rows].sort((a, b) => (b[input.sortBy] as number) - (a[input.sortBy] as number));

  const summary = sorted.length === 0
    ? `No page data for ${siteUrl} in ${dateRange.label}.`
    : `Top page for ${siteUrl} in ${dateRange.label} (sorted by ${input.sortBy}): ${sorted[0].page} — ${sorted[0].clicks.toLocaleString("en-US")} clicks, ${sorted[0].impressions.toLocaleString("en-US")} impr, CTR ${(sorted[0].ctr * 100).toFixed(2)}%, pos ${sorted[0].position.toFixed(1)}.`;

  const preview = sorted.length === 0
    ? "No rows returned."
    : `Showing ${sorted.length} of ${sorted.length} rows.\n${sorted
        .map(
          (row, index) =>
            `${index + 1}. ${row.page} | clicks ${row.clicks.toLocaleString("en-US")} | impr ${row.impressions.toLocaleString("en-US")} | CTR ${(row.ctr * 100).toFixed(2)}% | pos ${row.position.toFixed(1)}`
        )
        .join("\n")}`;

  return {
    summary,
    preview,
    siteUrl,
    dateRange,
    sortBy: input.sortBy,
    searchType: input.searchType,
    rowCount: sorted.length,
    rows: sorted,
    warnings: [] as string[]
  };
}
