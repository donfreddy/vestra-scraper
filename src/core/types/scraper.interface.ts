import { z } from 'zod';
import type { RawLead } from './lead.entity.js';

export const scraperQuerySchema = z.object({
  /** Terme métier, ex: "Hôtel", "Clinique", "École privée". */
  query: z.string().min(1),
  /** Zone cible, ex: "Douala, Cameroun". */
  location: z.string().min(1),
  /** Pays ISO-3166 alpha-2 pour la normalisation des téléphones. */
  country: z.string().length(2).default('CM'),
  /** Nombre maximum de fiches à retourner (0 = pas de limite). */
  limit: z.number().int().nonnegative().default(0),
});

export type ScraperQuery = z.infer<typeof scraperQuerySchema>;

export interface ScraperContext {
  /** Signal d'annulation propagé par l'orchestrateur (Ctrl+C, timeout global). */
  signal?: AbortSignal;
  logger: import('../logger.js').Logger;
}

/**
 * Contrat implémenté par chaque source. Le streaming via AsyncIterable permet
 * au pipeline de traiter/exporter les leads au fil de l'eau sans tout charger
 * en mémoire.
 */
export interface IScraper {
  readonly name: string;
  execute(query: ScraperQuery, ctx: ScraperContext): AsyncIterable<RawLead>;
}
