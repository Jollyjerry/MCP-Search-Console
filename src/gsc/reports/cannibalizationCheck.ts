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

export const cannibalizationCheckInputSchema = z
  .object({
    siteUrl: z.string().min(1).optional(),
    preset: presetEnum.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    minImpressionsPerPage: z.number().int().min(1).default(20),
    maxPositionGap: z.number().min(0).default(10),
    maxAveragePosition: z.number().min(1).default(30),
    minPagesPerQuery: z.number().int().min(2).default(2),
    limit: z.number().int().min(1).max(100).default(20),
    candidatePoolSize: z.number().int().min(100).max(5000).default(2000),
    searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all"]).default("final")
  })
  .refine(
    (value) => !(value.preset && (value.startDate || value.endDate)),
    { message: "Provide either a preset or a custom startDate/endDate pair." }
  );

export type CannibalizationCheckInput = z.infer<typeof cannibalizationCheckInputSchema>;

type Pair = { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number };
type Group = {
  query: string;
  pages: Pair[];
  totalClicks: number;
  totalImpressions: number;
  bestPosition: number;
  worstPosition: number;
  positionGap: number;
};

export async function getCannibalizationCheck(client: GscClient, rawInput: CannibalizationCheckInput) {
  const input = cannibalizationCheckInputSchema.parse(rawInput);
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
    dimensions: ["query", "page"],
    rowLimit: input.candidatePoolSize,
    searchType: input.searchType,
    dataState: input.dataState
  });

  const pairs: Pair[] = (data.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "",
    page: row.keys?.[1] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0
  })).filter((p) => p.impressions >= input.minImpressionsPerPage);

  const grouped = new Map<string, Pair[]>();
  for (const pair of pairs) {
    const list = grouped.get(pair.query) ?? [];
    list.push(pair);
    grouped.set(pair.query, list);
  }

  const groups: Group[] = [];
  for (const [query, pages] of grouped.entries()) {
    if (pages.length < input.minPagesPerQuery) continue;
    const positions = pages.map((p) => p.position);
    const bestPosition = Math.min(...positions);
    const worstPosition = Math.max(...positions);
    const gap = worstPosition - bestPosition;
    if (gap > input.maxPositionGap) continue;
    if (bestPosition > input.maxAveragePosition) continue;
    const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);
    const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
    groups.push({
      query,
      pages: pages.sort((a, b) => a.position - b.position),
      totalClicks,
      totalImpressions,
      bestPosition,
      worstPosition,
      positionGap: gap
    });
  }

  groups.sort((a, b) => b.totalImpressions - a.totalImpressions);
  const top = groups.slice(0, input.limit);

  const summary = top.length === 0
    ? `No query-level cannibalization detected for ${siteUrl} in ${dateRange.label} (with the current thresholds).`
    : `Cannibalization candidates for ${siteUrl} in ${dateRange.label}: ${top.length} queries with ${input.minPagesPerQuery}+ pages competing within ${input.maxPositionGap} positions of each other. Top: "${top[0].query}" with ${top[0].pages.length} pages, positions ${top[0].bestPosition.toFixed(1)}-${top[0].worstPosition.toFixed(1)}, ${top[0].totalImpressions.toLocaleString("en-US")} total impressions.`;

  const preview = top.length === 0
    ? "No rows returned."
    : top
        .map((group, index) => {
          const lines = [
            `${index + 1}. "${group.query}" — ${group.pages.length} pages, gap ${group.positionGap.toFixed(1)}, ${group.totalImpressions.toLocaleString("en-US")} impr, ${group.totalClicks.toLocaleString("en-US")} clicks`
          ];
          for (const page of group.pages.slice(0, 5)) {
            lines.push(`     pos ${page.position.toFixed(1)} | impr ${page.impressions.toLocaleString("en-US")} | ${page.page}`);
          }
          if (group.pages.length > 5) {
            lines.push(`     (+${group.pages.length - 5} more pages)`);
          }
          return lines.join("\n");
        })
        .join("\n");

  return {
    summary,
    preview,
    siteUrl,
    dateRange,
    thresholds: {
      minImpressionsPerPage: input.minImpressionsPerPage,
      maxPositionGap: input.maxPositionGap,
      maxAveragePosition: input.maxAveragePosition,
      minPagesPerQuery: input.minPagesPerQuery
    },
    candidatesScanned: pairs.length,
    rowCount: top.length,
    groups: top,
    warnings: pairs.length === input.candidatePoolSize
      ? [`Hit candidatePoolSize cap (${input.candidatePoolSize}) — increase to scan more long-tail queries.`]
      : []
  };
}
