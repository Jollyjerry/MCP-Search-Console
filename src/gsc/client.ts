import { google, type searchconsole_v1 } from "googleapis";

import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger(env.LOG_LEVEL);

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

function buildAuth() {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccountCredentials;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
    }
    return new google.auth.GoogleAuth({
      credentials: { client_email: parsed.client_email, private_key: parsed.private_key },
      scopes: SCOPES
    });
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new google.auth.GoogleAuth({
      keyFile: env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SCOPES
    });
  }
  throw new Error("Google credentials are not configured (set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON).");
}

export type SearchAnalyticsRequest = {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: Array<"query" | "page" | "country" | "device" | "date" | "searchAppearance">;
  searchType?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: searchconsole_v1.Schema$ApiDimensionFilterGroup[];
  dataState?: "final" | "all";
};

export class GscClient {
  private readonly client: searchconsole_v1.Searchconsole;

  constructor() {
    this.client = google.searchconsole({ version: "v1", auth: buildAuth() });
  }

  async listSites() {
    logger.debug("Listing GSC sites");
    const response = await this.client.sites.list();
    return response.data.siteEntry ?? [];
  }

  async query(request: SearchAnalyticsRequest) {
    const { siteUrl, ...body } = request;
    logger.debug("Running GSC search analytics query", {
      siteUrl,
      dimensions: body.dimensions ?? [],
      dateRange: `${body.startDate}..${body.endDate}`
    });
    const response = await this.client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: body.startDate,
        endDate: body.endDate,
        dimensions: body.dimensions,
        searchType: body.searchType,
        rowLimit: body.rowLimit,
        startRow: body.startRow,
        dimensionFilterGroups: body.dimensionFilterGroups,
        dataState: body.dataState
      }
    });
    return response.data;
  }

  async verifyAccess(siteUrl: string) {
    const data = await this.query({
      siteUrl,
      startDate: addDaysAgo(7),
      endDate: addDaysAgo(1),
      rowLimit: 1
    });
    return {
      siteUrl,
      reachable: true,
      sampleRowCount: data.rows?.length ?? 0
    };
  }
}

function addDaysAgo(days: number) {
  const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function createGscClient() {
  return new GscClient();
}

export function resolveSiteUrl(input?: string) {
  const siteUrl = input?.trim() || env.GSC_DEFAULT_SITE;
  if (!siteUrl) {
    throw new Error(
      "siteUrl is required. Pass it explicitly or set GSC_DEFAULT_SITE (e.g. sc-domain:example.com or https://www.example.com/)."
    );
  }
  return siteUrl;
}
