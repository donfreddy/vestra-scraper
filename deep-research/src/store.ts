import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hotelRecordSchema, type HotelRecord } from './types.js';

/**
 * Sauvegarde locale résiliente (un seul fichier JSON, réécrit atomiquement).
 * Sert de reprise : un hôtel déjà présent (par slug) est sauté au relancement.
 */
export class RecordStore {
  readonly path: string;
  private records = new Map<string, HotelRecord>();

  constructor(path: string) {
    this.path = resolve(process.cwd(), path);
  }

  load(): void {
    if (!existsSync(this.path)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, 'utf-8'));
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      const r = hotelRecordSchema.safeParse(item);
      if (r.success) this.records.set(r.data.slug, r.data);
    }
  }

  has(slug: string): boolean {
    return this.records.has(slug);
  }

  get(slug: string): HotelRecord | undefined {
    return this.records.get(slug);
  }

  all(): HotelRecord[] {
    return [...this.records.values()];
  }

  /** Ajoute/remplace un enregistrement et réécrit le fichier immédiatement. */
  upsert(record: HotelRecord): void {
    this.records.set(record.slug, record);
    this.flush();
  }

  private flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.all(), null, 2), 'utf-8');
    renameSync(tmp, this.path);
  }
}
