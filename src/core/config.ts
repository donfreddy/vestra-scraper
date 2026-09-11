import { z } from 'zod';
import dotenv from 'dotenv';
import { parseProxyList, type ProxyConfig } from './network/proxy-manager.js';

dotenv.config({ quiet: true });

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : !/^(0|false|no|off)$/i.test(v.trim())));

const envSchema = z.object({
  HEADLESS: boolish.default(true),
  BROWSER_LOCALE: z.string().default('fr-FR'),
  BROWSER_TIMEZONE: z.string().default('Africa/Douala'),
  BROWSER_CONCURRENCY: z.coerce.number().int().positive().default(1),

  RATE_MAX_REQUESTS: z.coerce.number().int().positive().default(5),
  RATE_INTERVAL_MS: z.coerce.number().int().positive().default(1000),

  MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1500),

  PROXIES: z.string().default(''),
  DEFAULT_COUNTRY: z.string().length(2).default('CM'),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  SMTP_CHECK: boolish.default(true),
  SMTP_FROM: z.string().default('verify@example.com'),
  ENRICH_CONCURRENCY: z.coerce.number().int().positive().default(3),
  WEBSITE_MAX_PAGES: z.coerce.number().int().positive().default(4),
});

export interface AppConfig {
  headless: boolean;
  browserLocale: string;
  browserTimezone: string;
  browserConcurrency: number;
  rate: { maxRequests: number; intervalMs: number };
  retry: { retries: number; baseDelayMs: number };
  proxies: ProxyConfig[];
  defaultCountry: string;
  enrichment: {
    anthropicApiKey?: string;
    smtpProbe: boolean;
    smtpFrom: string;
    concurrency: number;
    websiteMaxPages: number;
  };
}

let cached: AppConfig | undefined;

export function loadConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  if (cached && Object.keys(overrides).length === 0) return cached;

  // Treat empty-string env vars (`KEY=` in .env) as absent so defaults apply.
  const merged = { ...process.env, ...overrides };
  for (const key of Object.keys(merged)) {
    if (merged[key] === '') delete merged[key];
  }
  const parsed = envSchema.parse(merged);
  const config: AppConfig = {
    headless: parsed.HEADLESS,
    browserLocale: parsed.BROWSER_LOCALE,
    browserTimezone: parsed.BROWSER_TIMEZONE,
    browserConcurrency: parsed.BROWSER_CONCURRENCY,
    rate: { maxRequests: parsed.RATE_MAX_REQUESTS, intervalMs: parsed.RATE_INTERVAL_MS },
    retry: { retries: parsed.MAX_RETRIES, baseDelayMs: parsed.RETRY_BASE_DELAY_MS },
    proxies: parseProxyList(parsed.PROXIES),
    defaultCountry: parsed.DEFAULT_COUNTRY.toUpperCase(),
    enrichment: {
      anthropicApiKey: parsed.ANTHROPIC_API_KEY,
      smtpProbe: parsed.SMTP_CHECK,
      smtpFrom: parsed.SMTP_FROM,
      concurrency: parsed.ENRICH_CONCURRENCY,
      websiteMaxPages: parsed.WEBSITE_MAX_PAGES,
    },
  };

  if (Object.keys(overrides).length === 0) cached = config;
  return config;
}
