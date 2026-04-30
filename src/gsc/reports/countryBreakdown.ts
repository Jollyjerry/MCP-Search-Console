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

export const countryBreakdownInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(250).default(20),
    sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
    searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all"]).default("final")
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type CountryBreakdownInput = z.infer<typeof countryBreakdownInputSchema>;

export async function getCountryBreakdown(client: GscClient, rawInput: CountryBreakdownInput) {
  const input = countryBreakdownInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const dateRange = normalizeDateRange({
    preset: input.preset,
    startDate: input.startDate,
    endDate: input.endDate
  });

  const data = await client.query({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ["country"],
    rowLimit: input.limit,
    searchType: input.searchType,
    dataState: input.dataState
  });

  const rows = (data.rows ?? []).map((row) => ({
    country: (row.keys?.[0] ?? "").toUpperCase() || "(not set)",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  }));

  const sorted = [...rows].sort((a, b) => (b[input.sortBy] as number) - (a[input.sortBy] as number));

  const totalClicks = sorted.reduce((s, r) => s + r.clicks, 0);

  const summary = sorted.length === 0
    ? `No country data for ${siteUrl} in ${dateRange.label}.`
    : `Top country for ${siteUrl} in ${dateRange.label} (sorted by ${input.sortBy}): ${sorted[0].country} — ${sorted[0].clicks.toLocaleString("en-US")} clicks (${totalClicks > 0 ? ((sorted[0].clicks / totalClicks) * 100).toFixed(1) : "0"}% av totalt), CTR ${(sorted[0].ctr * 100).toFixed(2)}%, pos ${sorted[0].position.toFixed(1)}.`;

  const preview = sorted.length === 0
    ? "No rows returned."
    : `Showing ${sorted.length} of ${sorted.length} rows.\n${sorted
        .map((row, index) => {
          const share = totalClicks > 0 ? ((row.clicks / totalClicks) * 100).toFixed(1) : "0";
          return `${index + 1}. ${row.country} | clicks ${row.clicks.toLocaleString("en-US")} (${share}%) | impr ${row.impressions.toLocaleString("en-US")} | CTR ${(row.ctr * 100).toFixed(2)}% | pos ${row.position.toFixed(1)}`;
        })
        .join("\n")}`;

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
