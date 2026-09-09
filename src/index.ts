export { ScraperEngine } from './engine.js';
export type { EngineOptions, RunOptions, RunResult, SourceName } from './engine.js';

export { loadConfig } from './core/config.js';
export type { AppConfig } from './core/config.js';
export { Logger } from './core/logger.js';
export type { LogLevel } from './core/logger.js';

export { LeadPipeline, normalizeLead, buildLeadId, inferRole } from './core/pipeline/pipeline.js';
export type { PipelineStats, NormalizeOptions } from './core/pipeline/pipeline.js';
export { Deduplicator } from './core/pipeline/deduplicator.js';
export { applyPatch } from './core/pipeline/merge.js';
export { normalizePhone, toE164 } from './core/pipeline/phone-normalizer.js';
export { normalizeCity, cityKey } from './core/pipeline/city-normalizer.js';

export { HttpDriver } from './core/driver/http.driver.js';
export { BrowserDriver } from './core/driver/browser.driver.js';
export { ProxyManager, parseProxyList } from './core/network/proxy-manager.js';
export type { ProxyConfig } from './core/network/proxy-manager.js';
export { RateLimiter } from './core/network/rate-limiter.js';
export { withRetry, isRetryableError } from './core/network/retry.js';

export { createExporter, resolveFormat, flattenLead, LEAD_COLUMNS } from './core/exporters/index.js';
export { JsonExporter, CsvExporter, ExcelExporter } from './core/exporters/index.js';
export type { ILeadExporter, ExporterResult, ExportFormat } from './core/types/exporter.interface.js';

export { GoogleMapsScraper } from './scrapers/google-maps/gmaps.scraper.js';
export * as gmapsParser from './scrapers/google-maps/gmaps.parser.js';

export {
  WebsiteEnricher,
  EmailVerifier,
  ReviewsEnricher,
  detectChains,
  KNOWN_CHAINS,
  createEnricher,
  parseEnricherList,
  ENRICHER_NAMES,
} from './enrichers/index.js';
export type { EnricherName } from './enrichers/index.js';
export { summarizeReviews } from './enrichers/review-summary.js';
export type {
  IEnricher,
  EnrichContext,
  LeadPatch,
} from './core/types/enricher.interface.js';

export type { IScraper, ScraperQuery, ScraperContext } from './core/types/scraper.interface.js';
export {
  b2bLeadSchema,
  leadContactSchema,
  socialLinksSchema,
  reviewsInsightSchema,
  ContactRole,
} from './core/types/lead.entity.js';
export type {
  B2BLead,
  LeadContact,
  RawLead,
  SocialLinks,
  EmailStatus,
  ReviewsInsight,
} from './core/types/lead.entity.js';
