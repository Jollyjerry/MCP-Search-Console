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

export const deviceBreakdownInputSchema = z
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

export type DeviceBreakdownInput = z.infer<typeof deviceBreakdownInputSchema>;

export async function getDeviceBreakdown(client: GscClient, rawInput: DeviceBreakdownInput) {
  const input = deviceBreakdownInputSchema.parse(rawInput);
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
    dimensions: ["device"],
    rowLimit: 5,
    searchType: input.searchType,
    dataState: input.dataState
  });

  const rows = (data.rows ?? []).map((row) => ({
    device: row.keys?.[0] ?? "(not set)",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  }));

  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);

  const sorted = [...rows].sort((a, b) => b.clicks - a.clicks);

  const summary = sorted.length === 0
    ? `No device data for ${siteUrl} in ${dateRange.label}.`
    : `Device split for ${siteUrl} in ${dateRange.label}: ${sorted
        .map((row) => {
          const share = totalClicks > 0 ? ((row.clicks / totalClicks) * 100).toFixed(0) : "0";
          return `${row.device} ${share}%`;
        })
        .join(", ")} (av ${totalClicks.toLocaleString("en-US")} clicks).`;

  const preview = sorted.length === 0
    ? "No rows returned."
    : sorted
        .map((row) => {
          const clickShare = totalClicks > 0 ? ((row.clicks / totalClicks) * 100).toFixed(1) : "0";
          const imprShare = totalImpressions > 0 ? ((row.impressions / totalImpressions) * 100).toFixed(1) : "0";
          return `${row.device} | clicks ${row.clicks.toLocaleString("en-US")} (${clickShare}%) | impr ${row.impressions.toLocaleString("en-US")} (${imprShare}%) | CTR ${(row.ctr * 100).toFixed(2)}% | pos ${row.position.toFixed(1)}`;
        })
        .join("\n");

  return {
    summary,
    preview,
    siteUrl,
    dateRange,
    rowCount: sorted.length,
    totals: { clicks: totalClicks, impressions: totalImpressions },
    rows: sorted,
    warnings: [] as string[]
  };
}
