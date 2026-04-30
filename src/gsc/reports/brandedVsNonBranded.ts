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

export const brandedVsNonBrandedInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    brandRegex: z.string().min(1).default("jollyroom"),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all"]).default("final")
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type BrandedVsNonBrandedInput = z.infer<typeof brandedVsNonBrandedInputSchema>;

async function fetchTotals(
  client: GscClient,
  siteUrl: string,
  startDate: string,
  endDate: string,
  brandRegex: string,
  branded: boolean,
  searchType: BrandedVsNonBrandedInput["searchType"],
  dataState: BrandedVsNonBrandedInput["dataState"]
) {
  const data = await client.query({
    siteUrl,
    startDate,
    endDate,
    rowLimit: 1,
    searchType,
    dataState,
    dimensionFilterGroups: [
      {
        groupType: "and",
        filters: [
          {
            dimension: "query",
            operator: branded ? "includingRegex" : "excludingRegex",
            expression: brandRegex
          }
        ]
      }
    ]
  });
  const row = data.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0
  };
}

export async function getBrandedVsNonBranded(
  client: GscClient,
  rawInput: BrandedVsNonBrandedInput
) {
  const input = brandedVsNonBrandedInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const dateRange = normalizeDateRange({
    preset: input.preset,
    startDate: input.startDate,
    endDate: input.endDate
  });

  const [branded, nonBranded] = await Promise.all([
    fetchTotals(client, siteUrl, dateRange.startDate, dateRange.endDate, input.brandRegex, true, input.searchType, input.dataState),
    fetchTotals(client, siteUrl, dateRange.startDate, dateRange.endDate, input.brandRegex, false, input.searchType, input.dataState)
  ]);

  const totalClicks = branded.clicks + nonBranded.clicks;
  const totalImpressions = branded.impressions + nonBranded.impressions;

  const brandedShare = totalClicks > 0 ? (branded.clicks / totalClicks) * 100 : 0;
  const nonBrandedShare = totalClicks > 0 ? (nonBranded.clicks / totalClicks) * 100 : 0;

  const summary = totalClicks === 0
    ? `No query data for ${siteUrl} in ${dateRange.label}.`
    : `Branded vs non-branded for ${siteUrl} in ${dateRange.label}: branded ${brandedShare.toFixed(1)}% (${branded.clicks.toLocaleString("en-US")} clicks), non-branded ${nonBrandedShare.toFixed(1)}% (${nonBranded.clicks.toLocaleString("en-US")} clicks). Brand regex: /${input.brandRegex}/i.`;

  const preview = totalClicks === 0
    ? "No rows returned."
    : [
        `Branded   | clicks ${branded.clicks.toLocaleString("en-US")} (${brandedShare.toFixed(1)}%) | impr ${branded.impressions.toLocaleString("en-US")} | CTR ${(branded.ctr * 100).toFixed(2)}% | pos ${branded.position.toFixed(1)}`,
        `Non-brand | clicks ${nonBranded.clicks.toLocaleString("en-US")} (${nonBrandedShare.toFixed(1)}%) | impr ${nonBranded.impressions.toLocaleString("en-US")} | CTR ${(nonBranded.ctr * 100).toFixed(2)}% | pos ${nonBranded.position.toFixed(1)}`
      ].join("\n");

  return {
    summary,
    preview,
    siteUrl,
    dateRange,
    brandRegex: input.brandRegex,
    branded: { ...branded, sharePercent: brandedShare },
    nonBranded: { ...nonBranded, sharePercent: nonBrandedShare },
    totals: { clicks: totalClicks, impressions: totalImpressions },
    warnings: [] as string[]
  };
}
