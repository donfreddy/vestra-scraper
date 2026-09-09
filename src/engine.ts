import { loadConfig, type AppConfig } from './core/config.js';
import { Logger, type LogLevel } from './core/logger.js';
import { BrowserDriver } from './core/driver/browser.driver.js';
import { HttpDriver } from './core/driver/http.driver.js';
import { LeadPipeline } from './core/pipeline/pipeline.js';
import { createExporter, resolveFormat } from './core/exporters/index.js';
import { GoogleMapsScraper } from './scrapers/google-maps/gmaps.scraper.js';
import { scraperQuerySchema, type IScraper, type ScraperQuery } from './core/types/scraper.interface.js';
import type { B2BLead } from './core/types/lead.entity.js';
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
  /** Chemin du fichier de sortie. Le format est déduit de l'extension. */
  output: string;
  format?: ExportFormat;
  signal?: AbortSignal;
}

export interface RunResult {
  leads: B2BLead[];
  stats: PipelineStats;
  export: ExporterResult;
  durationMs: number;
}

/**
 * Orchestrateur : instancie le driver adéquat, lance la stratégie de scraping,
 * fait passer le flux dans le pipeline (validation + normalisation + dédup) et
 * pousse chaque lead propre vers l'exporter choisi.
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
        throw new Error(`Source inconnue: ${String(exhaustive)}`);
      }
    }
  }

  async run(options: RunOptions): Promise<RunResult> {
    const started = Date.now();
    const query: ScraperQuery = scraperQuerySchema.parse({
      query: options.query,
      location: options.location,
      country: options.country ?? this.config.defaultCountry,
      limit: options.limit ?? 0,
    });

    const format = resolveFormat(options.output, options.format);
    const exporter = createExporter(format, options.output);

    const browser = new BrowserDriver({
      headless: this.config.headless,
      locale: this.config.browserLocale,
      timezone: this.config.browserTimezone,
      proxies: this.config.proxies,
      concurrency: this.config.browserConcurrency,
      navigationRate: { maxRequests: this.config.rate.maxRequests, intervalMs: this.config.rate.intervalMs },
      logger: this.logger,
    });

    const scraper = this.buildScraper(options.source ?? 'google-maps', browser);
    const pipeline = new LeadPipeline(
      { defaultCountry: query.country, fallbackCity: query.location.split(',')[0]?.trim() },
      this.logger.child('pipeline'),
    );

    const leads: B2BLead[] = [];
    await exporter.open();
    try {
      const source = scraper.execute(query, { logger: this.logger, signal: options.signal });
      for await (const lead of pipeline.run(source)) {
        leads.push(lead);
        await exporter.write(lead);
        this.logger.info(`✓ ${lead.companyName}${lead.city ? ` — ${lead.city}` : ''}`);
      }
    } finally {
      await browser.close().catch((e) => this.logger.warn('fermeture navigateur:', e as Error));
    }

    const exportResult = await exporter.close();
    return { leads, stats: pipeline.stats, export: exportResult, durationMs: Date.now() - started };
  }

  /** Accès à un driver HTTP configuré (rate-limit + proxies + retry) pour un futur scraper d'annuaire. */
  createHttpDriver(): HttpDriver {
    return new HttpDriver({
      proxies: this.config.proxies,
      rateLimit: this.config.rate.maxRequests
        ? { maxRequests: this.config.rate.maxRequests, intervalMs: this.config.rate.intervalMs }
        : undefined,
      retry: { retries: this.config.retry.retries, baseDelayMs: this.config.retry.baseDelayMs },
      logger: this.logger,
    });
  }
}
