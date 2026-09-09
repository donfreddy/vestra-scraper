import type { B2BLead } from './lead.entity.js';
import type { HttpDriver } from '../driver/http.driver.js';
import type { BrowserDriver } from '../driver/browser.driver.js';
import type { Logger } from '../logger.js';

/** Fragment de lead retourné par un enricher, fusionné dans le lead d'origine. */
export type LeadPatch = Partial<
  Pick<
    B2BLead,
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
  /** Clé API Anthropic (résumé d'avis). Absente => l'enricher dégrade proprement. */
  anthropicApiKey?: string;
}

/**
 * Contrat d'un enricher : prend un lead validé, retourne un patch à fusionner.
 * Ne doit jamais lever : en cas d'échec réseau, retourner `{}` et logger.
 */
export interface IEnricher {
  readonly name: string;
  /** `false` => lead ignoré par cet enricher (ex: pas de site web). */
  supports(lead: B2BLead): boolean;
  enrich(lead: B2BLead, ctx: EnrichContext): Promise<LeadPatch>;
}
