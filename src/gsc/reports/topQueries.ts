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

export const topQueriesInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(1000).default(25),
    sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
    searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all"]).default("final"),
    countryFilter: z.string().length(3).optional(),
    deviceFilter: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional()
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type TopQueriesInput = z.infer<typeof topQueriesInputSchema>;

export async function getTopQueries(client: GscClient, rawInput: TopQueriesInput) {
  const input = topQueriesInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const dateRange = normalizeDateRange({
    preset: input.preset,
    startDate: input.startDate,
    endDate: input.endDate
  });

  const dimensionFilterGroups: any[] = [];
  const filters: any[] = [];
  if (input.countryFilter) {
    filters.push({ dimension: "country", operator: "equals", expression: input.countryFilter.toLowerCase() });
  }
  if (input.deviceFilter) {
    filters.push({ dimension: "device", operator: "equals", expression: input.deviceFilter });
  }
  if (filters.length > 0) {
    dimensionFilterGroups.push({ groupType: "and", filters });
  }

  const data = await client.query({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ["query"],
    rowLimit: input.limit,
    searchType: input.searchType,
    dataState: input.dataState,
    dimensionFilterGroups: dimensionFilterGroups.length > 0 ? dimensionFilterGroups : undefined
  });

  const rows = (data.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "(not set)",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  }));

  const sorted = [...rows].sort((a, b) => (b[input.sortBy] as number) - (a[input.sortBy] as number));

  const summary = sorted.length === 0
    ? `No query data for ${siteUrl} in ${dateRange.label}.`
    : `Top query for ${siteUrl} in ${dateRange.label} (sorted by ${input.sortBy}): "${sorted[0].query}" — ${sorted[0].clicks.toLocaleString("en-US")} clicks, ${sorted[0].impressions.toLocaleString("en-US")} impr, CTR ${(sorted[0].ctr * 100).toFixed(2)}%, pos ${sorted[0].position.toFixed(1)}.`;

  const preview = sorted.length === 0
    ? "No rows returned."
    : `Showing ${sorted.length} of ${sorted.length} rows.\n${sorted
        .map(
          (row, index) =>
            `${index + 1}. "${row.query}" | clicks ${row.clicks.toLocaleString("en-US")} | impr ${row.impressions.toLocaleString("en-US")} | CTR ${(row.ctr * 100).toFixed(2)}% | pos ${row.position.toFixed(1)}`
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
