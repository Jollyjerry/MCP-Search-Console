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

export const ctrOpportunitiesInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    minImpressions: z.number().int().min(1).default(100),
    minPosition: z.number().min(1).default(5),
    maxPosition: z.number().min(1).default(20),
    maxCtr: z.number().min(0).max(1).default(0.05),
    requireBothFilters: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(25),
    candidatePoolSize: z.number().int().min(50).max(5000).default(1000),
    searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all"]).default("final")
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  )
  .refine(
    (value) => value.minPosition <= value.maxPosition,
    { message: "minPosition must be less than or equal to maxPosition." }
  );

export type CtrOpportunitiesInput = z.infer<typeof ctrOpportunitiesInputSchema>;

const POSITION_CTR_BENCHMARK: Array<{ position: number; ctr: number }> = [
  { position: 1, ctr: 0.32 },
  { position: 2, ctr: 0.18 },
  { position: 3, ctr: 0.10 },
  { position: 4, ctr: 0.07 },
  { position: 5, ctr: 0.05 },
  { position: 6, ctr: 0.04 },
  { position: 7, ctr: 0.03 },
  { position: 8, ctr: 0.025 },
  { position: 9, ctr: 0.02 },
  { position: 10, ctr: 0.02 }
];

function expectedCtrFor(position: number) {
  if (position <= 1) return POSITION_CTR_BENCHMARK[0].ctr;
  if (position >= 10) return POSITION_CTR_BENCHMARK[9].ctr;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return POSITION_CTR_BENCHMARK[lower - 1].ctr;
  const frac = position - lower;
  const lowCtr = POSITION_CTR_BENCHMARK[lower - 1].ctr;
  const highCtr = POSITION_CTR_BENCHMARK[upper - 1].ctr;
  return lowCtr + (highCtr - lowCtr) * frac;
}

export async function getCtrOpportunities(client: GscClient, rawInput: CtrOpportunitiesInput) {
  const input = ctrOpportunitiesInputSchema.parse(rawInput);
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
    dimensions: ["query"],
    rowLimit: input.candidatePoolSize,
    searchType: input.searchType,
    dataState: input.dataState
  });

  const rows = (data.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "(not set)",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  }));

  const candidates = rows
    .filter((row) => row.impressions >= input.minImpressions)
    .filter((row) => {
      const positionMatch = row.position >= input.minPosition && row.position <= input.maxPosition;
      const ctrMatch = row.ctr <= input.maxCtr;
      return input.requireBothFilters ? positionMatch && ctrMatch : positionMatch || ctrMatch;
    })
    .map((row) => {
      const benchmarkCtr = expectedCtrFor(row.position);
      const additionalCtr = Math.max(0, benchmarkCtr - row.ctr);
      const potentialAdditionalClicks = Math.round(row.impressions * additionalCtr);
      return { ...row, benchmarkCtr, potentialAdditionalClicks };
    });

  const sorted = candidates.sort((a, b) => b.potentialAdditionalClicks - a.potentialAdditionalClicks).slice(0, input.limit);

  const summary = sorted.length === 0
    ? `No CTR opportunities for ${siteUrl} in ${dateRange.label} matching impressions>=${input.minImpressions}, position ${input.minPosition}-${input.maxPosition}, CTR<=${(input.maxCtr * 100).toFixed(1)}%.`
    : `Top opportunity for ${siteUrl} in ${dateRange.label}: "${sorted[0].query}" — pos ${sorted[0].position.toFixed(1)}, ${sorted[0].impressions.toLocaleString("en-US")} impr, CTR ${(sorted[0].ctr * 100).toFixed(2)}% (benchmark ${(sorted[0].benchmarkCtr * 100).toFixed(1)}%). Reaching benchmark CTR could add ~${sorted[0].potentialAdditionalClicks.toLocaleString("en-US")} clicks.`;

  const preview = sorted.length === 0
    ? "No rows returned."
    : `Showing ${sorted.length} of ${sorted.length} rows.\n${sorted
        .map(
          (row, index) =>
            `${index + 1}. "${row.query}" | impr ${row.impressions.toLocaleString("en-US")} | CTR ${(row.ctr * 100).toFixed(2)}% (vs ~${(row.benchmarkCtr * 100).toFixed(1)}% benchmark) | pos ${row.position.toFixed(1)} | +${row.potentialAdditionalClicks.toLocaleString("en-US")} potential clicks`
        )
        .join("\n")}`;

  return {
    summary,
    preview,
    siteUrl,
    dateRange,
    filters: {
      minImpressions: input.minImpressions,
      positionRange: [input.minPosition, input.maxPosition],
      maxCtr: input.maxCtr,
      requireBothFilters: input.requireBothFilters
    },
    candidatesScanned: rows.length,
    rowCount: sorted.length,
    rows: sorted,
    warnings: rows.length === input.candidatePoolSize
      ? [`Hit candidatePoolSize cap (${input.candidatePoolSize}) — increase if you want to scan more long-tail queries.`]
      : []
  };
}
