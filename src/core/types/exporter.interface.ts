import type { B2BLead } from './lead.entity.js';

/**
 * Cible de persistance des leads. Le mode streaming (`open`/`write`/`close`)
 * évite d'accumuler tous les résultats en mémoire pour les gros volumes.
 */
export interface ILeadExporter {
  readonly name: string;
  /** Préparation (ouverture de fichier, connexion, en-têtes...). */
  open(): Promise<void>;
  /** Persiste un lead validé. Peut être appelé de nombreuses fois. */
  write(lead: B2BLead): Promise<void>;
  /** Finalisation (flush, fermeture, retourne un résumé lisible). */
  close(): Promise<ExporterResult>;
}

export interface ExporterResult {
  target: string;
  count: number;
  /** Chemin de fichier produit, le cas échéant. */
  location?: string;
}

export type ExportFormat = 'json' | 'csv' | 'excel';
