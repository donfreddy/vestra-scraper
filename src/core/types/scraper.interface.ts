import { z } from 'zod';
import type { RawLead } from './lead.entity.js';

export const scraperQuerySchema = z.object({
  /** Business term, e.g. "Hotel", "Clinic", "Private school". */
  query: z.string().min(1),
  /** Target area, e.g. "Douala, Cameroon". */
  location: z.string().min(1),
  /** ISO-3166 alpha-2 country used for phone normalization. */
  country: z.string().length(2).default('CM'),
  /** Maximum number of records to return (0 = no limit). */
  limit: z.number().int().nonnegative().default(0),
});

export type ScraperQuery = z.infer<typeof scraperQuerySchema>;

export interface ScraperContext {
  /** Cancellation signal propagated by the orchestrator (Ctrl+C, global timeout). */
  signal?: AbortSignal;
  logger: import('../logger.js').Logger;
}

/**
 * Contract implemented by each source. Streaming via AsyncIterable lets the
 * pipeline process/export leads on the fly without loading everything into
 * memory.
 */
export interface IScraper {
  readonly name: string;
  execute(query: ScraperQuery, ctx: ScraperContext): AsyncIterable<RawLead>;
}
