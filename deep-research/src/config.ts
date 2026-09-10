import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : !/^(0|false|no|off)$/i.test(v.trim())));

const schema = z.object({
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_SEARCH: boolish.default(true),
  NOTION_API_KEY: z.string().min(1).optional(),
  NOTION_DATABASE_ID: z.string().min(1).optional(),
  REQUEST_INTERVAL_MS: z.coerce.number().int().nonnegative().default(4500),
  MAX_RETRIES: z.coerce.number().int().nonnegative().default(4),
  REVIEW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
});

export interface AppConfig {
  geminiApiKey?: string;
  geminiModel: string;
  geminiSearch: boolean;
  notionApiKey?: string;
  notionDatabaseId?: string;
  requestIntervalMs: number;
  maxRetries: number;
  reviewConfidenceThreshold: number;
}

export function loadConfig(): AppConfig {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && v !== '') merged[k] = v;
  }
  const p = schema.parse(merged);
  return {
    geminiApiKey: p.GEMINI_API_KEY,
    geminiModel: p.GEMINI_MODEL,
    geminiSearch: p.GEMINI_SEARCH,
    notionApiKey: p.NOTION_API_KEY,
    notionDatabaseId: p.NOTION_DATABASE_ID,
    requestIntervalMs: p.REQUEST_INTERVAL_MS,
    maxRetries: p.MAX_RETRIES,
    reviewConfidenceThreshold: p.REVIEW_CONFIDENCE_THRESHOLD,
  };
}

export function requireGemini(c: AppConfig): string {
  if (!c.geminiApiKey) throw new Error('GEMINI_API_KEY manquante (voir .env.example)');
  return c.geminiApiKey;
}

export function requireNotion(c: AppConfig): { apiKey: string; databaseId: string } {
  if (!c.notionApiKey || !c.notionDatabaseId) {
    throw new Error('NOTION_API_KEY et/ou NOTION_DATABASE_ID manquants (voir .env.example)');
  }
  return { apiKey: c.notionApiKey, databaseId: c.notionDatabaseId };
}
