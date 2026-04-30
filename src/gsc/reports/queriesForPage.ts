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

export const queriesForPageInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    page: z.string().min(1),
    matchType: z.enum(["equals", "contains"]).default("equals"),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(1000).default(25),
    sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
    dataState: z.enum(["final", "all"]).default("final")
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type QueriesForPageInput = z.infer<typeof queriesForPageInputSchema>;

export async function getQueriesForPage(client: GscClient, rawInput: QueriesForPageInput) {
  const input = queriesForPageInputSchema.parse(rawInput);
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
        { dimension: "page", operator: input.matchType, expression: input.page }
      ]
    }
  ];

  const data = await client.query({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ["query"],
    rowLimit: input.limit,
    dataState: input.dataState,
    dimensionFilterGroups
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
    ? `No queries drove traffic to ${input.page} on ${siteUrl} in ${dateRange.label}.`
    : `Top query for page "${input.page}" on ${siteUrl} in ${dateRange.label} (sorted by ${input.sortBy}): "${sorted[0].query}" — ${sorted[0].clicks.toLocaleString("en-US")} clicks, ${sorted[0].impressions.toLocaleString("en-US")} impr, CTR ${(sorted[0].ctr * 100).toFixed(2)}%, pos ${sorted[0].position.toFixed(1)}.`;

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
    page: input.page,
    matchType: input.matchType,
    dateRange,
    sortBy: input.sortBy,
    rowCount: sorted.length,
    rows: sorted,
    warnings: [] as string[]
  };
}
