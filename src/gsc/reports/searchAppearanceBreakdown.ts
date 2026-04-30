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

export const searchAppearanceBreakdownInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
    searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all"]).default("final")
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type SearchAppearanceBreakdownInput = z.infer<typeof searchAppearanceBreakdownInputSchema>;

export async function getSearchAppearanceBreakdown(client: GscClient, rawInput: SearchAppearanceBreakdownInput) {
  const input = searchAppearanceBreakdownInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const dateRange = normalizeDateRange({
    preset: input.preset,
    startDate: input.startDate,
    endDate: input.endDate
  });

  // GSC restriction: searchAppearance dimension cannot be combined with others or with dimensionFilterGroups.
  const data = await client.query({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ["searchAppearance"],
    rowLimit: 100,
    searchType: input.searchType,
    dataState: input.dataState
  });

  const rows = (data.rows ?? []).map((row) => ({
    appearance: row.keys?.[0] ?? "(not set)",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  }));

  const sorted = [...rows].sort((a, b) => (b[input.sortBy] as number) - (a[input.sortBy] as number));
  const totalClicks = sorted.reduce((s, r) => s + r.clicks, 0);

  const summary = sorted.length === 0
    ? `No search appearance data for ${siteUrl} in ${dateRange.label}. (Site may have no rich results / SERP features tracked.)`
    : `Search appearance for ${siteUrl} in ${dateRange.label}: ${sorted.length} types found, top is ${sorted[0].appearance} (${sorted[0].clicks.toLocaleString("en-US")} clicks, ${totalClicks > 0 ? ((sorted[0].clicks / totalClicks) * 100).toFixed(1) : "0"}% av totalt).`;

  const preview = sorted.length === 0
    ? "No rows returned."
    : sorted
        .map((row, index) => {
          const share = totalClicks > 0 ? ((row.clicks / totalClicks) * 100).toFixed(1) : "0";
          return `${index + 1}. ${row.appearance} | clicks ${row.clicks.toLocaleString("en-US")} (${share}%) | impr ${row.impressions.toLocaleString("en-US")} | CTR ${(row.ctr * 100).toFixed(2)}% | pos ${row.position.toFixed(1)}`;
        })
        .join("\n");

  return {
    summary,
    preview,
    siteUrl,
    dateRange,
    sortBy: input.sortBy,
    rowCount: sorted.length,
    totals: { clicks: totalClicks },
    rows: sorted,
    warnings: [] as string[]
  };
}
