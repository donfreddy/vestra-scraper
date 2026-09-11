import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { vestraLeadSchema, type VestraLead } from '../types/lead.entity.js';
import type { Logger } from '../logger.js';

/**
 * Progress journal (JSONL) that lets an interrupted run resume without redoing
 * enrichment already performed. One line = one finalized lead. The file is
 * removed when the run completes normally.
 */
export class CheckpointStore {
  readonly path: string;

  constructor(outputPath: string, signature: string, dir = '.vestra-cache') {
    const hash = createHash('sha1').update(signature).digest('hex').slice(0, 12);
    const base = outputPath.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(-40);
    this.path = resolve(process.cwd(), dir, `${base || 'run'}.${hash}.jsonl`);
  }

  /** Leads finalized by previous executions, keyed by `id`. */
  load(logger?: Logger): Map<string, VestraLead> {
    const done = new Map<string, VestraLead>();
    if (!existsSync(this.path)) return done;

    const lines = readFileSync(this.path, 'utf-8').split('\n');
    let corrupt = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const lead = vestraLeadSchema.parse(JSON.parse(trimmed));
        done.set(lead.id, lead);
      } catch {
        corrupt += 1; // partial line (crash mid-write): skip it
      }
    }
    if (done.size > 0) {
      logger?.info(
        `resuming: ${done.size} leads already processed${corrupt ? ` (${corrupt} line(s) skipped)` : ''}`,
      );
    }
    return done;
  }

  append(lead: VestraLead): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(lead)}\n`, 'utf-8');
  }

  clear(): void {
    rmSync(this.path, { force: true });
  }
}
