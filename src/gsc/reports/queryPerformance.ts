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

export const queryPerformanceInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    query: z.string().min(1),
    matchType: z.enum(["equals", "contains", "notContains"]).default("equals"),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    breakdownBy: z.enum(["page", "date", "country", "device"]).default("page"),
    limit: z.number().int().min(1).max(1000).default(25),
    sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
    dataState: z.enum(["final", "all"]).default("final")
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type QueryPerformanceInput = z.infer<typeof queryPerformanceInputSchema>;

export async function getQueryPerformance(client: GscClient, rawInput: QueryPerformanceInput) {
  const input = queryPerformanceInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const dateRange = normalizeDateRange({
    preset: input.preset,
    startDate: input.startDate,
    endDate: input.endDate
  });

  const dimensionFilterGroups = [
    {
      groupType: "and",
      filters: [
        {
          dimension: "query",
          operator: input.matchType,
          expression: input.query
        }
      ]
    }
  ];

  const totalsData = await client.query({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    rowLimit: 1,
    dataState: input.dataState,
    dimensionFilterGroups
  });

  const breakdownData = await client.query({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: [input.breakdownBy],
    rowLimit: input.limit,
    dataState: input.dataState,
    dimensionFilterGroups
  });

  const totalsRow = totalsData.rows?.[0];
  const totals = {
    clicks: totalsRow?.clicks ?? 0,
    impressions: totalsRow?.impressions ?? 0,
    ctr: totalsRow?.ctr ?? 0,
    position: totalsRow?.position ?? 0
  };

  const rows = (breakdownData.rows ?? []).map((row) => ({
    [input.breakdownBy]: row.keys?.[0] ?? "(not set)",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  })) as Array<Record<string, string | number>>;

  const sorted = [...rows].sort((a, b) => (b[input.sortBy] as number) - (a[input.sortBy] as number));

  const summary = totals.impressions === 0
    ? `No data for query "${input.query}" on ${siteUrl} in ${dateRange.label}.`
    : `Query "${input.query}" (${input.matchType}) on ${siteUrl}, ${dateRange.label}: ${totals.clicks.toLocaleString("en-US")} clicks, ${totals.impressions.toLocaleString("en-US")} impressions, CTR ${(totals.ctr * 100).toFixed(2)}%, avg pos ${totals.position.toFixed(1)}.`;

  const preview = sorted.length === 0
    ? "No breakdown rows returned."
    : `Showing ${sorted.length} of ${sorted.length} rows by ${input.breakdownBy}.\n${sorted
        .map(
          (row, index) =>
            `${index + 1}. ${row[input.breakdownBy]} | clicks ${(row.clicks as number).toLocaleString("en-US")} | impr ${(row.impressions as number).toLocaleString("en-US")} | CTR ${((row.ctr as number) * 100).toFixed(2)}% | pos ${(row.position as number).toFixed(1)}`
        )
        .join("\n")}`;

  return {
    summary,
    preview,
    siteUrl,
    query: input.query,
    matchType: input.matchType,
    breakdownBy: input.breakdownBy,
    dateRange,
    totals,
    rowCount: sorted.length,
    rows: sorted,
    warnings: [] as string[]
  };
}
