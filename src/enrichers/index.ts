import type { IEnricher } from '../core/types/enricher.interface.js';
import { WebsiteEnricher } from './website.enricher.js';
import { EmailVerifier } from './email-verifier.js';
import { ReviewsEnricher } from './reviews.enricher.js';

export { WebsiteEnricher } from './website.enricher.js';
export { EmailVerifier } from './email-verifier.js';
export { ReviewsEnricher } from './reviews.enricher.js';
export { detectChains, KNOWN_CHAINS } from './chain.js';
export * as extract from './extract.js';

export type EnricherName = 'website' | 'email' | 'reviews';

export const ENRICHER_NAMES: EnricherName[] = ['website', 'email', 'reviews'];

export interface EnricherFactoryOptions {
  smtpProbe?: boolean;
  smtpFrom?: string;
  websiteMaxPages?: number;
}

export function createEnricher(name: EnricherName, options: EnricherFactoryOptions = {}): IEnricher {
  switch (name) {
    case 'website':
      return new WebsiteEnricher({ maxPages: options.websiteMaxPages });
    case 'email':
      return new EmailVerifier({ smtpProbe: options.smtpProbe, fromAddress: options.smtpFrom });
    case 'reviews':
      return new ReviewsEnricher();
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown enricher: ${String(exhaustive)}`);
    }
  }
}

/** Parses `"website,email"` / `"all"` into a list of valid enrichers (stable order). */
export function parseEnricherList(spec: string | undefined): EnricherName[] {
  if (!spec) return [];
  const raw = spec.trim().toLowerCase();
  if (raw === 'all') return [...ENRICHER_NAMES];
  const wanted = new Set(raw.split(',').map((s) => s.trim()));
  return ENRICHER_NAMES.filter((n) => wanted.has(n));
}
