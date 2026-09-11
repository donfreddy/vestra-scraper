import {type AppConfig, loadConfig} from './core/config.js';
import {Logger, type LogLevel} from './core/logger.js';
import {BrowserDriver} from './core/driver/browser.driver.js';
import {HttpDriver} from './core/driver/http.driver.js';
import type {PipelineStats} from './core/pipeline/pipeline.js';
import {LeadPipeline} from './core/pipeline/pipeline.js';
import {applyPatch} from './core/pipeline/merge.js';
import {CheckpointStore} from './core/pipeline/checkpoint.js';
import {createExporter, resolveFormat} from './core/exporters/index.js';
import {GoogleMapsScraper} from './scrapers/google-maps/gmaps.scraper.js';
import {createEnricher, detectChains, type EnricherName, parseEnricherList,} from './enrichers/index.js';
import {type IScraper, type ScraperQuery, scraperQuerySchema} from './core/types/scraper.interface.js';
import type {VestraLead} from './core/types/lead.entity.js';
import type {EnrichContext, IEnricher} from './core/types/enricher.interface.js';
import type {ExporterResult, ExportFormat} from './core/types/exporter.interface.js';

export type SourceName = 'google-maps' | 'gmaps';

export interface EngineOptions {
  logLevel?: LogLevel;
  config?: Partial<AppConfig>;
}

export interface RunOptions {
  /** One or more business terms (e.g. "Hôtel", "Auberge"). */
  query: string | string[];
  /** One or more target areas (e.g. neighborhoods). Each pairs with each query. */
  location: string | string[];
  source?: SourceName;
  limit?: number;
  country?: string;
  /** Output file path. The format is inferred from the extension. */
  output: string;
  format?: ExportFormat;
  /** Enricher list: `"website,email"`, `"all"`, or empty for none. */
  enrich?: string;
  /** Ignore (and reset) any existing checkpoint for this run. */
  fresh?: boolean;
  signal?: AbortSignal;
}

export interface EnrichmentSummary {
  enrichers: EnricherName[];
  leadsEnriched: number;
  chainsDetected: number;
}

export interface RunResult {
  leads: VestraLead[];
  stats: PipelineStats;
  export: ExporterResult;
  enrichment?: EnrichmentSummary;
  /** Leads restored from a previous interrupted run (checkpoint). */
  resumed: number;
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
        throw new Error(`Unknown source: ${String(source)}`);
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
    const country = (options.country ?? this.config.defaultCountry).toUpperCase();
    const limit = options.limit ?? 0;
    const queries = toList(options.query);
    const locations = toList(options.location);
    if (queries.length === 0 || locations.length === 0) {
      throw new Error('run(): at least one query and one location are required');
    }

    // Every (query × location) pair becomes one search; the shared pipeline
    // deduplicates across all of them.
    const searches: ScraperQuery[] = [];
    for (const q of queries) {
      for (const loc of locations) {
        searches.push(scraperQuerySchema.parse({ query: q, location: loc, country, limit }));
      }
    }

    const enricherNames = parseEnricherList(options.enrich);
    const exporter = createExporter(resolveFormat(options.output, options.format), options.output);
    const browser = this.newBrowser();
    const scraper = this.buildScraper(options.source ?? 'google-maps', browser);
    const pipeline = new LeadPipeline(
      { defaultCountry: country, fallbackCity: locations[0]!.split(',')[0]?.trim() },
      this.logger.child('pipeline'),
    );

    const willEnrich = enricherNames.length > 0;
    const signature = [
      options.source ?? 'gmaps',
      searches.map((s) => `${s.query}@${s.location}`).sort().join(';'),
      enricherNames.join(','),
    ].join('|');
    const checkpoint = new CheckpointStore(options.output, signature);
    if (options.fresh) checkpoint.clear();
    const restored = options.fresh ? new Map<string, VestraLead>() : checkpoint.load(this.logger);
    const isDone = (l: VestraLead): boolean => !willEnrich || l.metadata?.['enrichAttempted'] === true;

    const leads: VestraLead[] = [...restored.values()];

    try {
      // 1. Scrape every search through one shared pipeline (single dedup pass);
      //    persist each new lead immediately so an interrupted scrape isn't lost.
      if (searches.length > 1) this.logger.info(`${searches.length} searches queued`);
      for (const [i, search] of searches.entries()) {
        if (options.signal?.aborted) break;
        if (searches.length > 1) {
          this.logger.info(`[${i + 1}/${searches.length}] "${search.query}" @ "${search.location}"`);
        }
        const source = scraper.execute(search, { logger: this.logger, signal: options.signal });
        for await (const lead of pipeline.run(source)) {
          if (restored.has(lead.id)) continue;
          leads.push(lead);
          checkpoint.append(lead);
          this.logger.info(`✓ ${lead.companyName}${lead.city ? ` — ${lead.city}` : ''}`);
        }
      }

      // 2. Enrich — only leads not yet attempted (fresh + partially-done runs).
      let enrichment: EnrichmentSummary | undefined;
      if (willEnrich && !options.signal?.aborted) {
        enrichment = await this.enrich(leads, isDone, enricherNames, browser, checkpoint, options.signal);
      }

      // 3. Export the full set (restored + fresh).
      await exporter.open();
      for (const lead of leads) await exporter.write(lead);
      const exportResult = await exporter.close();

      if (!options.signal?.aborted) checkpoint.clear();
      return {
        leads,
        stats: pipeline.stats,
        export: exportResult,
        ...(enrichment ? { enrichment } : {}),
        resumed: [...restored.values()].filter(isDone).length,
        durationMs: Date.now() - started,
      };
    } finally {
      await browser.close().catch((e) => this.logger.warn('closing browser:', e as Error));
    }
  }

  private async enrich(
    leads: VestraLead[],
    isDone: (l: VestraLead) => boolean,
    names: EnricherName[],
    browser: BrowserDriver,
    checkpoint: CheckpointStore,
    signal: AbortSignal | undefined,
  ): Promise<EnrichmentSummary> {
    const log = this.logger.child('enrich');
    const todo = leads.map((_, i) => i).filter((i) => !isDone(leads[i]!));
    const restoredCount = leads.length - todo.length;
    log.info(
      `enrichment (${names.join(', ')}) on ${todo.length} leads` +
        (restoredCount ? ` (+${restoredCount} restored)` : ''),
    );

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
    await mapPool(todo, this.config.enrichment.concurrency, async (index) => {
      if (signal?.aborted) return;
      let current = leads[index]!;
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
      current = { ...current, metadata: { ...current.metadata, enrichAttempted: true } };
      leads[index] = current;
      checkpoint.append(current); // persist progress for crash-resume
      if (touched) enriched += 1;
    });

    detectChains(leads);
    const chainsDetected = leads.filter((l) => l.chain?.isChain).length;
    log.info(`${enriched} leads enriched · ${chainsDetected} attached to a chain`);

    return { enrichers: names, leadsEnriched: enriched, chainsDetected };
  }
}

/** Normalizes a `string | string[]` option into a trimmed, non-empty list. */
function toList(value: string | string[]): string[] {
  return (Array.isArray(value) ? value : [value]).map((s) => s.trim()).filter(Boolean);
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
