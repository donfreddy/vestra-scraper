import type { VestraLead } from './lead.entity.js';

/**
 * Lead persistence target. The streaming mode (`open`/`write`/`close`)
 * avoids accumulating all results in memory for large volumes.
 */
export interface ILeadExporter {
  readonly name: string;
  /** Preparation (file open, connection, headers...). */
  open(): Promise<void>;
  /** Persists a validated lead. Can be called many times. */
  write(lead: VestraLead): Promise<void>;
  /** Finalization (flush, close, returns a readable summary). */
  close(): Promise<ExporterResult>;
}

export interface ExporterResult {
  target: string;
  count: number;
  /** Produced file path, if any. */
  location?: string;
}

export type ExportFormat = 'json' | 'csv' | 'excel';
