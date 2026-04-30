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

export const timeSeriesInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    granularity: z.enum(["day", "week", "month"]).default("day"),
    metric: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
    queryFilter: z.string().min(1).optional(),
    queryMatchType: z.enum(["equals", "contains", "includingRegex"]).default("contains"),
    pageFilter: z.string().min(1).optional(),
    pageMatchType: z.enum(["equals", "contains"]).default("contains"),
    searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all"]).default("final")
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type TimeSeriesInput = z.infer<typeof timeSeriesInputSchema>;

function isoWeek(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function monthBucket(dateStr: string) {
  return dateStr.slice(0, 7);
}

function aggregateRows(
  rows: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>,
  granularity: "day" | "week" | "month"
) {
  if (granularity === "day") return rows;
  const buckets = new Map<string, { date: string; clicks: number; impressions: number; ctrSum: number; positionSum: number; count: number }>();
  for (const row of rows) {
    const key = granularity === "week" ? isoWeek(row.date) : monthBucket(row.date);
    const entry = buckets.get(key) ?? { date: key, clicks: 0, impressions: 0, ctrSum: 0, positionSum: 0, count: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.ctrSum += row.ctr * row.impressions;
    entry.positionSum += row.position * row.impressions;
    entry.count += 1;
    buckets.set(key, entry);
  }
  return Array.from(buckets.values()).map((entry) => ({
    date: entry.date,
    clicks: entry.clicks,
    impressions: entry.impressions,
    ctr: entry.impressions > 0 ? entry.ctrSum / entry.impressions : 0,
    position: entry.impressions > 0 ? entry.positionSum / entry.impressions : 0
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function buildSparkline(values: number[]) {
  if (values.length === 0) return "";
  const blocks = "▁▂▃▄▅▆▇█";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v) => blocks[Math.min(7, Math.floor(((v - min) / span) * 7))])
    .join("");
}

export async function getTimeSeries(client: GscClient, rawInput: TimeSeriesInput) {
  const input = timeSeriesInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const dateRange = normalizeDateRange({
    preset: input.preset,
    startDate: input.startDate,
    endDate: input.endDate
  });

  const filters: any[] = [];
  if (input.queryFilter) {
    filters.push({ dimension: "query", operator: input.queryMatchType, expression: input.queryFilter });
  }
  if (input.pageFilter) {
    filters.push({ dimension: "page", operator: input.pageMatchType, expression: input.pageFilter });
  }
  const dimensionFilterGroups = filters.length > 0 ? [{ groupType: "and", filters }] : undefined;

  const data = await client.query({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ["date"],
    rowLimit: 1000,
    searchType: input.searchType,
    dataState: input.dataState,
    dimensionFilterGroups
  });

  const dailyRows = (data.rows ?? []).map((row) => ({
    date: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  })).sort((a, b) => a.date.localeCompare(b.date));

  const aggregated = aggregateRows(dailyRows, input.granularity);
  const values = aggregated.map((row) => row[input.metric] as number);
  const sparkline = buildSparkline(values);

  const totalClicks = aggregated.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = aggregated.reduce((s, r) => s + r.impressions, 0);
  const avgPosition = totalImpressions > 0
    ? aggregated.reduce((s, r) => s + r.position * r.impressions, 0) / totalImpressions
    : 0;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

  const filterDescription = [
    input.queryFilter ? `query ${input.queryMatchType} "${input.queryFilter}"` : null,
    input.pageFilter ? `page ${input.pageMatchType} "${input.pageFilter}"` : null
  ].filter(Boolean).join(", ") || "no filter";

  const summary = aggregated.length === 0
    ? `No time-series data for ${siteUrl} in ${dateRange.label} (${filterDescription}).`
    : `${siteUrl} ${input.metric} (${input.granularity}) over ${dateRange.label} [${filterDescription}]: ${aggregated.length} buckets, sparkline ${sparkline}. Totals: ${totalClicks.toLocaleString("en-US")} clicks, ${totalImpressions.toLocaleString("en-US")} impressions, avg CTR ${(avgCtr * 100).toFixed(2)}%, avg pos ${avgPosition.toFixed(1)}.`;

  const preview = aggregated.length === 0
    ? "No rows returned."
    : `Showing ${aggregated.length} buckets.\n${aggregated
        .map((row) => `${row.date} | clicks ${row.clicks.toLocaleString("en-US")} | impr ${row.impressions.toLocaleString("en-US")} | CTR ${(row.ctr * 100).toFixed(2)}% | pos ${row.position.toFixed(1)}`)
        .join("\n")}`;

  return {
    summary,
    preview,
    siteUrl,
    dateRange,
    granularity: input.granularity,
    metric: input.metric,
    sparkline,
    totals: { clicks: totalClicks, impressions: totalImpressions, ctr: avgCtr, position: avgPosition },
    rowCount: aggregated.length,
    rows: aggregated,
    filters: { query: input.queryFilter ?? null, page: input.pageFilter ?? null },
    warnings: [] as string[]
  };
}
