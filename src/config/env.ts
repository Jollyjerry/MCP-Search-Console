import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  GSC_DEFAULT_SITE: z.string().trim().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().trim().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().trim().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  MCP_MODE: z.enum(["stdio", "http"]).default("stdio"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  ALLOWED_HOSTS: z.string().trim().optional(),
  MCP_AUTH_TOKEN: z.string().trim().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
