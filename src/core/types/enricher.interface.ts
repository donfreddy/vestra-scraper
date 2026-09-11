import type { VestraLead } from './lead.entity.js';
import type { HttpDriver } from '../driver/http.driver.js';
import type { BrowserDriver } from '../driver/browser.driver.js';
import type { Logger } from '../logger.js';

/** Lead fragment returned by an enricher, merged into the original lead. */
export type LeadPatch = Partial<
  Pick<
    VestraLead,
    | 'email'
    | 'emails'
    | 'phones'
    | 'socials'
    | 'emailStatus'
    | 'emailCatchAll'
    | 'legalName'
    | 'employeeRange'
    | 'chain'
    | 'reviews'
    | 'contacts'
    | 'category'
  >
> & { metadata?: Record<string, unknown> };

export interface EnrichContext {
  http: HttpDriver;
  browser?: BrowserDriver;
  logger: Logger;
  country: string;
  signal?: AbortSignal;
  /** Anthropic API key (review summary). Absent => the enricher degrades cleanly. */
  anthropicApiKey?: string;
}

/**
 * Contract of an enricher: takes a validated lead, returns a patch to merge.
 * Must never throw: on network failure, return `{}` and log.
 */
export interface IEnricher {
  readonly name: string;
  /** `false` => lead ignored by this enricher (e.g. no website). */
  supports(lead: VestraLead): boolean;
  enrich(lead: VestraLead, ctx: EnrichContext): Promise<LeadPatch>;
}
