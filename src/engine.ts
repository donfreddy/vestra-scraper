import { loadConfig, type AppConfig } from './core/config.js';
import { Logger, type LogLevel } from './core/logger.js';
import { BrowserDriver } from './core/driver/browser.driver.js';
import { HttpDriver } from './core/driver/http.driver.js';
import { LeadPipeline } from './core/pipeline/pipeline.js';
import { applyPatch } from './core/pipeline/merge.js';
import { createExporter, resolveFormat } from './core/exporters/index.js';
import { GoogleMapsScraper } from './scrapers/google-maps/gmaps.scraper.js';
import {
  createEnricher,
  detectChains,
  parseEnricherList,
  type EnricherName,
} from './enrichers/index.js';
import { scraperQuerySchema, type IScraper, type ScraperQuery } from './core/types/scraper.interface.js';
import type { B2BLead } from './core/types/lead.entity.js';
import type { EnrichContext, IEnricher } from './core/types/enricher.interface.js';
import type { ExportFormat, ExporterResult } from './core/types/exporter.interface.js';
import type { PipelineStats } from './core/pipeline/pipeline.js';

export type SourceName = 'google-maps' | 'gmaps';

export interface EngineOptions {
  logLevel?: LogLevel;
  config?: Partial<AppConfig>;
}

export interface RunOptions {
  query: string;
  location: string;
  source?: SourceName;
  limit?: number;
  country?: string;
  /** Output file path. The format is inferred from the extension. */
  output: string;
  format?: ExportFormat;
  /** Enricher list: `"website,email"`, `"all"`, or empty for none. */
  enrich?: string;
  signal?: AbortSignal;
}

export interface EnrichmentSummary {
  enrichers: EnricherName[];
  leadsEnriched: number;
  chainsDetected: number;
}

export interface RunResult {
  leads: B2BLead[];
  stats: PipelineStats;
  export: ExporterResult;
  enrichment?: EnrichmentSummary;
  durationMs: number;
}

/**
 * Orchestrator: scraping (Strategy) -> pipeline (validation / normalization /
 * dedup) -> optional enrichment -> export.
 */
export class ScraperEngine {
  private readonly config: AppConfig;
  private readonly logger: Logger;

  constructor(options: EngineOptions = {}) {
    this.config = { ...loadConfig(), ...options.config };
    this.logger = new Logger({ level: options.logLevel ?? 'info', scope: 'engine' });
  }

  private buildScraper(source: SourceName, browser: BrowserDriver): IScraper {
    switch (source) {
      case 'google-maps':
      case 'gmaps':
        return new GoogleMapsScraper({ browser });
      default: {
        const exhaustive: never = source;
        throw new Error(`Unknown source: ${String(exhaustive)}`);
      }
    }
  }

  createHttpDriver(): HttpDriver {
    return new HttpDriver({
      proxies: this.config.proxies,
      rateLimit: { maxRequests: this.config.rate.maxRequests, intervalMs: this.config.rate.intervalMs },
      retry: { retries: this.config.retry.retries, baseDelayMs: this.config.retry.baseDelayMs },
      logger: this.logger,
    });
  }

  private newBrowser(): BrowserDriver {
    return new BrowserDriver({
      headless: this.config.headless,
      locale: this.config.browserLocale,
      timezone: this.config.browserTimezone,
      proxies: this.config.proxies,
      concurrency: this.config.browserConcurrency,
      navigationRate: { maxRequests: this.config.rate.maxRequests, intervalMs: this.config.rate.intervalMs },
      logger: this.logger,
    });
  }

  async run(options: RunOptions): Promise<RunResult> {
    const started = Date.now();
    const query: ScraperQuery = scraperQuerySchema.parse({
      query: options.query,
      location: options.location,
      country: options.country ?? this.config.defaultCountry,
      limit: options.limit ?? 0,
    });

    const enricherNames = parseEnricherList(options.enrich);
    const exporter = createExporter(resolveFormat(options.output, options.format), options.output);
    const browser = this.newBrowser();
    const scraper = this.buildScraper(options.source ?? 'google-maps', browser);
    const pipeline = new LeadPipeline(
      { defaultCountry: query.country, fallbackCity: query.location.split(',')[0]?.trim() },
      this.logger.child('pipeline'),
    );

    const streaming = enricherNames.length === 0;
    const leads: B2BLead[] = [];

    if (streaming) await exporter.open();

    try {
      const source = scraper.execute(query, { logger: this.logger, signal: options.signal });
      for await (const lead of pipeline.run(source)) {
        leads.push(lead);
        if (streaming) await exporter.write(lead);
        this.logger.info(`✓ ${lead.companyName}${lead.city ? ` in ${lead.city}` : ''}`);
      }

      let enrichment: EnrichmentSummary | undefined;
      if (!streaming) {
        enrichment = await this.enrich(leads, enricherNames, browser, options.signal);
        await exporter.open();
        for (const lead of leads) await exporter.write(lead);
      }

      const exportResult = await exporter.close();
      return {
        leads,
        stats: pipeline.stats,
        export: exportResult,
        ...(enrichment ? { enrichment } : {}),
        durationMs: Date.now() - started,
      };
    } finally {
      await browser.close().catch((e) => this.logger.warn('closing browser:', e as Error));
    }
  }

  private async enrich(
    leads: B2BLead[],
    names: EnricherName[],
    browser: BrowserDriver,
    signal: AbortSignal | undefined,
  ): Promise<EnrichmentSummary> {
    const log = this.logger.child('enrich');
    log.info(`enrichment (${names.join(', ')}) on ${leads.length} leads`);

    const enrichers: IEnricher[] = names.map((n) =>
      createEnricher(n, {
        smtpProbe: this.config.enrichment.smtpProbe,
        smtpFrom: this.config.enrichment.smtpFrom,
        websiteMaxPages: this.config.enrichment.websiteMaxPages,
      }),
    );

    const ctx: EnrichContext = {
      http: this.createHttpDriver(),
      browser,
      logger: log,
      country: this.config.defaultCountry,
      ...(signal ? { signal } : {}),
      ...(this.config.enrichment.anthropicApiKey
        ? { anthropicApiKey: this.config.enrichment.anthropicApiKey }
        : {}),
    };

    let enriched = 0;
    await mapPool(leads, this.config.enrichment.concurrency, async (lead, index) => {
      if (signal?.aborted) return;
      let current = lead;
      let touched = false;
      for (const enricher of enrichers) {
        if (!enricher.supports(current)) continue;
        try {
          const patch = await enricher.enrich(current, ctx);
          if (Object.keys(patch).length > 0) {
            current = applyPatch(current, patch, enricher.name);
            touched = true;
          }
        } catch (error) {
          log.warn(`${enricher.name} failed on "${current.companyName}": ${(error as Error).message}`);
        }
      }
      leads[index] = current;
      if (touched) enriched += 1;
    });

    detectChains(leads);
    const chainsDetected = leads.filter((l) => l.chain?.isChain).length;
    log.info(`${enriched} leads enriched · ${chainsDetected} attached to a chain`);

    return { enrichers: names, leadsEnriched: enriched, chainsDetected };
  }
}

/** Applies `worker` to `items` with at most `concurrency` simultaneous tasks. */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const size = Math.max(1, concurrency);
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}
