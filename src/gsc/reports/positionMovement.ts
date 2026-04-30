import { z } from "zod";

import { GscClient, resolveSiteUrl } from "../client.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const positionMovementInputSchema = z.object({
  siteUrl: z.string().min(1).optional(),
  comparison: z.enum(["wow", "mom"]).default("mom"),
  minImpressions: z.number().int().min(1).default(50),
  limit: z.number().int().min(1).max(100).default(20),
  candidatePoolSize: z.number().int().min(100).max(5000).default(1000),
  direction: z.enum(["winners", "losers", "both"]).default("both"),
  searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
  dataState: z.enum(["final", "all"]).default("final")
});

export type PositionMovementInput = z.infer<typeof positionMovementInputSchema>;

type Range = { startDate: string; endDate: string; label: string };

function formatDate(date: Date) { return date.toISOString().slice(0, 10); }
function startOfUtcDay(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); }
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * DAY_MS); }

function computeRanges(comparison: "wow" | "mom"): { current: Range; previous: Range } {
  const today = startOfUtcDay(new Date());
  const yesterday = addDays(today, -1);
  const span = comparison === "wow" ? 7 : 30;
  const currentStart = addDays(yesterday, -(span - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(span - 1));
  return {
    current: { startDate: formatDate(currentStart), endDate: formatDate(yesterday), label: comparison === "wow" ? "Last 7 days" : "Last 30 days" },
    previous: { startDate: formatDate(previousStart), endDate: formatDate(previousEnd), label: comparison === "wow" ? "Prior 7 days" : "Prior 30 days" }
  };
}

async function fetchQueries(
  client: GscClient,
  siteUrl: string,
  range: Range,
  input: PositionMovementInput
) {
  const data = await client.query({
    siteUrl,
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ["query"],
    rowLimit: input.candidatePoolSize,
    searchType: input.searchType,
    dataState: input.dataState
  });
  const map = new Map<string, { clicks: number; impressions: number; ctr: number; position: number }>();
  for (const row of data.rows ?? []) {
    const key = row.keys?.[0] ?? "";
    if (!key) continue;
    map.set(key, {
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0
    });
  }
  return map;
}

export async function getPositionMovement(client: GscClient, rawInput: PositionMovementInput) {
  const input = positionMovementInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const { current, previous } = computeRanges(input.comparison);

  const [currentMap, previousMap] = await Promise.all([
    fetchQueries(client, siteUrl, current, input),
    fetchQueries(client, siteUrl, previous, input)
  ]);

  type Movement = {
    query: string;
    currentPosition: number;
    previousPosition: number;
    positionDelta: number;
    currentClicks: number;
    previousClicks: number;
    clicksDelta: number;
    currentImpressions: number;
    previousImpressions: number;
  };

  const movements: Movement[] = [];
  const allQueries = new Set<string>([...currentMap.keys(), ...previousMap.keys()]);
  for (const query of allQueries) {
    const cur = currentMap.get(query);
    const prev = previousMap.get(query);
    if (!cur || !prev) continue;
    const maxImpressions = Math.max(cur.impressions, prev.impressions);
    if (maxImpressions < input.minImpressions) continue;
    movements.push({
      query,
      currentPosition: cur.position,
      previousPosition: prev.position,
      positionDelta: cur.position - prev.position,
      currentClicks: cur.clicks,
      previousClicks: prev.clicks,
      clicksDelta: cur.clicks - prev.clicks,
      currentImpressions: cur.impressions,
      previousImpressions: prev.impressions
    });
  }

  // Negative delta = improved (lower position number is better in GSC).
  const winners = [...movements].filter((m) => m.positionDelta < 0).sort((a, b) => a.positionDelta - b.positionDelta);
  const losers = [...movements].filter((m) => m.positionDelta > 0).sort((a, b) => b.positionDelta - a.positionDelta);

  const summary = movements.length === 0
    ? `No queries with ${input.minImpressions}+ impressions in both periods for ${siteUrl}.`
    : `${siteUrl} ${input.comparison.toUpperCase()} position movement: ${winners.length} queries improved, ${losers.length} dropped (of ${movements.length} comparable queries).`;

  const lines: string[] = [];
  if (input.direction === "winners" || input.direction === "both") {
    lines.push("=== WINNERS (improved position) ===");
    if (winners.length === 0) lines.push("(none)");
    else {
      for (const [i, w] of winners.slice(0, input.limit).entries()) {
        lines.push(`${i + 1}. "${w.query}" | pos ${w.previousPosition.toFixed(1)} → ${w.currentPosition.toFixed(1)} (${w.positionDelta.toFixed(1)}) | clicks ${w.previousClicks} → ${w.currentClicks} (${w.clicksDelta >= 0 ? "+" : ""}${w.clicksDelta})`);
      }
    }
  }
  if (input.direction === "losers" || input.direction === "both") {
    if (lines.length > 0) lines.push("");
    lines.push("=== LOSERS (dropped position) ===");
    if (losers.length === 0) lines.push("(none)");
    else {
      for (const [i, l] of losers.slice(0, input.limit).entries()) {
        lines.push(`${i + 1}. "${l.query}" | pos ${l.previousPosition.toFixed(1)} → ${l.currentPosition.toFixed(1)} (+${l.positionDelta.toFixed(1)}) | clicks ${l.previousClicks} → ${l.currentClicks} (${l.clicksDelta >= 0 ? "+" : ""}${l.clicksDelta})`);
      }
    }
  }

  return {
    summary,
    preview: lines.join("\n"),
    siteUrl,
    comparison: input.comparison,
    current,
    previous,
    direction: input.direction,
    counts: { compared: movements.length, winners: winners.length, losers: losers.length },
    winners: winners.slice(0, input.limit),
    losers: losers.slice(0, input.limit),
    warnings: [] as string[]
  };
}
