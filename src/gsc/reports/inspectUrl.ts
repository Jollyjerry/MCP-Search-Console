import { z } from "zod";

import { GscClient, resolveSiteUrl } from "../client.js";

export const inspectUrlInputSchema = z.object({
  siteUrl: z.string().min(1).optional(),
  inspectionUrl: z.string().min(1),
  languageCode: z.string().min(2).max(8).default("en")
});

export type InspectUrlInput = z.infer<typeof inspectUrlInputSchema>;

export async function inspectUrl(client: GscClient, rawInput: InspectUrlInput) {
  const input = inspectUrlInputSchema.parse(rawInput);
  const siteUrl = resolveSiteUrl(input.siteUrl);
  const data = await client.inspectUrl(siteUrl, input.inspectionUrl, input.languageCode);

  const indexStatus = data.inspectionResult?.indexStatusResult;
  const mobileUsability = data.inspectionResult?.mobileUsabilityResult;
  const richResults = data.inspectionResult?.richResultsResult;

  const verdict = indexStatus?.verdict ?? "UNKNOWN";
  const coverageState = indexStatus?.coverageState ?? "(unknown)";
  const robotsTxtState = indexStatus?.robotsTxtState ?? "(unknown)";
  const indexingState = indexStatus?.indexingState ?? "(unknown)";
  const lastCrawlTime = indexStatus?.lastCrawlTime ?? null;
  const userCanonical = indexStatus?.userCanonical ?? null;
  const googleCanonical = indexStatus?.googleCanonical ?? null;
  const sitemapList = indexStatus?.sitemap ?? [];
  const referringUrls = indexStatus?.referringUrls ?? [];

  const lines: string[] = [];
  lines.push(`URL: ${input.inspectionUrl}`);
  lines.push(`Site: ${siteUrl}`);
  lines.push(`Verdict: ${verdict}`);
  lines.push(`Coverage: ${coverageState}`);
  lines.push(`Indexing: ${indexingState}`);
  lines.push(`Robots.txt: ${robotsTxtState}`);
  if (lastCrawlTime) lines.push(`Last crawl: ${lastCrawlTime}`);
  if (userCanonical) lines.push(`User canonical: ${userCanonical}`);
  if (googleCanonical && googleCanonical !== userCanonical) {
    lines.push(`Google canonical: ${googleCanonical} ⚠ differs from declared`);
  }
  if (sitemapList.length > 0) lines.push(`In sitemaps: ${sitemapList.join(", ")}`);
  if (referringUrls.length > 0) lines.push(`Referring URLs (sample): ${referringUrls.slice(0, 3).join(", ")}${referringUrls.length > 3 ? ` (+${referringUrls.length - 3} more)` : ""}`);

  if (mobileUsability) {
    lines.push(`Mobile usability: ${mobileUsability.verdict ?? "(unknown)"}`);
    const mobileIssues = mobileUsability.issues ?? [];
    if (mobileIssues.length > 0) {
      lines.push(`  Mobile issues: ${mobileIssues.map((i) => i.message).filter(Boolean).join("; ")}`);
    }
  }

  if (richResults) {
    lines.push(`Rich results: ${richResults.verdict ?? "(unknown)"}`);
    const detected = richResults.detectedItems ?? [];
    if (detected.length > 0) {
      lines.push(`  Detected: ${detected.map((d) => `${d.richResultType} (${d.items?.length ?? 0} items)`).join(", ")}`);
    }
  }

  const summary = `Inspection of ${input.inspectionUrl}: ${verdict} (${coverageState}).`;

  return {
    summary,
    preview: lines.join("\n"),
    siteUrl,
    inspectionUrl: input.inspectionUrl,
    verdict,
    coverageState,
    robotsTxtState,
    indexingState,
    lastCrawlTime,
    userCanonical,
    googleCanonical,
    canonicalMatch: userCanonical && googleCanonical ? userCanonical === googleCanonical : null,
    sitemaps: sitemapList,
    mobileUsability: mobileUsability ?? null,
    richResults: richResults ?? null,
    inspectionResultLink: data.inspectionResult?.inspectionResultLink ?? null,
    warnings: [] as string[]
  };
}
