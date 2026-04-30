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

export const trafficOverviewInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
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

export type TrafficOverviewInput = z.infer<typeof trafficOverviewInputSchema>;

export async function getTrafficOverview(client: GscClient, rawInput: TrafficOverviewInput) {
  const input = trafficOverviewInputSchema.parse(rawInput);
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
    rowLimit: 1,
    searchType: input.searchType,
    dataState: input.dataState
  });

  const row = data.rows?.[0];
  const totals = {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0
  };

  const summary = totals.impressions === 0
    ? `No Search Console data for ${siteUrl} in ${dateRange.label}.`
    : `${siteUrl} in ${dateRange.label}: ${totals.clicks.toLocaleString("en-US")} clicks, ${totals.impressions.toLocaleString("en-US")} impressions, CTR ${(totals.ctr * 100).toFixed(2)}%, avg position ${totals.position.toFixed(1)}.`;

  return {
    summary,
    siteUrl,
    dateRange,
    searchType: input.searchType,
    totals,
    warnings: [] as string[]
  };
}
