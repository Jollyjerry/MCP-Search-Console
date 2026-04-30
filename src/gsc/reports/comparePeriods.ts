import { z } from "zod";

import { GscClient, resolveSiteUrl } from "../client.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const comparePeriodsInputSchema = z.object({
  siteUrl: z.string().min(1).optional(),
  comparison: z.enum(["wow", "mom", "yoy", "previous_period"]).default("wow"),
  searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
  dataState: z.enum(["final", "all"]).default("final"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export type ComparePeriodsInput = z.infer<typeof comparePeriodsInputSchema>;

type Range = { startDate: string; endDate: string; label: string };

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDaysInclusive(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

function computeRanges(input: ComparePeriodsInput): { current: Range; previous: Range } {
  const today = startOfUtcDay(new Date());
  const yesterday = addDays(today, -1);

  if (input.startDate && input.endDate) {
    const currentStart = startOfUtcDay(new Date(input.startDate));
    const currentEnd = startOfUtcDay(new Date(input.endDate));
    const length = diffDaysInclusive(currentStart, currentEnd);
    const previousEnd = addDays(currentStart, -1);
    const previousStart = addDays(previousEnd, -(length - 1));
    return {
      current: { startDate: formatDate(currentStart), endDate: formatDate(currentEnd), label: "Custom range" },
      previous: { startDate: formatDate(previousStart), endDate: formatDate(previousEnd), label: "Previous (same length)" }
    };
  }

  const span = input.comparison === "wow" ? 7 : 30;
  const currentEnd = yesterday;
  const currentStart = addDays(currentEnd, -(span - 1));
  let previousStart: Date;
  let previousEnd: Date;
  let label: string;

  if (input.comparison === "yoy") {
    previousEnd = addDays(currentEnd, -365);
    previousStart = addDays(previousEnd, -(span - 1));
    label = "YoY (same 30 days a year ago)";
  } else if (input.comparison === "wow") {
    previousEnd = addDays(currentStart, -1);
    previousStart = addDays(previousEnd, -(span - 1));
    label = "WoW (prior 7 days)";
  } else {
    previousEnd = addDays(currentStart, -1);
    previousStart = addDays(previousEnd, -(span - 1));
    label = input.comparison === "mom" ? "MoM (prior 30 days)" : "Previous period";
  }

  return {
    current: { startDate: formatDate(currentStart), endDate: formatDate(currentEnd), label: input.comparison === "wow" ? "Last 7 days" : "Last 30 days" },
    previous: { startDate: formatDate(previousStart), endDate: formatDate(previousEnd), label }
  };
}

async function fetchTotals(client: GscClient, siteUrl: string, range: Range, input: ComparePeriodsInput) {
  const data = await client.query({
    siteUrl,
    startDate: range.startDate,
    endDate: range.endDate,
    rowLimit: 1,
    searchType: input.searchType,
    dataState: input.dataState
  });
  const row = data.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0
  };
}

function delta(current: number, previous: number) {
  if (previous === 0) {
    return { absolute: current, percent: current === 0 ? 0 : Infinity };
  }
  return {
    absolute: current - previous,
    percent: ((current - previous) / previous) * 100
  };
}

function fmtPercent(value: number) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export async function comparePeriods(client: GscClient, rawInput: ComparePeriodsInput) {
  const input = comparePeriodsInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const { current, previous } = computeRanges(input);

  const [currentTotals, previousTotals] = await Promise.all([
    fetchTotals(client, siteUrl, current, input),
    fetchTotals(client, siteUrl, previous, input)
  ]);

  const deltas = {
    clicks: delta(currentTotals.clicks, previousTotals.clicks),
    impressions: delta(currentTotals.impressions, previousTotals.impressions),
    ctr: delta(currentTotals.ctr * 100, previousTotals.ctr * 100),
    position: delta(currentTotals.position, previousTotals.position)
  };

  const summary = `${siteUrl} ${input.comparison.toUpperCase()}: clicks ${currentTotals.clicks.toLocaleString("en-US")} (${fmtPercent(deltas.clicks.percent)}), impressions ${currentTotals.impressions.toLocaleString("en-US")} (${fmtPercent(deltas.impressions.percent)}), CTR ${(currentTotals.ctr * 100).toFixed(2)}% (${fmtPercent(deltas.ctr.percent)}pp), avg position ${currentTotals.position.toFixed(1)} (${deltas.position.absolute > 0 ? "+" : ""}${deltas.position.absolute.toFixed(1)}).`;

  return {
    summary,
    siteUrl,
    comparison: input.comparison,
    current: { ...current, totals: currentTotals },
    previous: { ...previous, totals: previousTotals },
    deltas,
    warnings: [] as string[]
  };
}
