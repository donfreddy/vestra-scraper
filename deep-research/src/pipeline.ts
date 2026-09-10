import chalk from 'chalk';
import type { GoogleGenAI } from '@google/genai';
import type { AppConfig } from './config.js';
import { enrichHotel } from './gemini.js';
import { toE164 } from './phone.js';
import { hotelSlug } from './slug.js';
import { RecordStore } from './store.js';
import type { NotionSink } from './notion.js';
import { hotelRecordSchema, type GeminiHotel, type HotelRecord, type HotelTask } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t && t.toLowerCase() !== 'null' && t.toLowerCase() !== 'n/a' ? t : null;
};

function cleanUrl(v: string | null | undefined): string | null {
  const t = clean(v);
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function toRecord(
  task: HotelTask,
  g: GeminiHotel,
  sources: string[],
  model: string,
  threshold: number,
  searchUsed = true,
): HotelRecord {
  const owner = clean(g.owner);
  const management = clean(g.management);
  // Sans recherche web, la donnée n'est jamais vérifiée : plafond de confiance
  // et statut « à vérifier » systématique.
  const rawConfidence = g.governance_confidence ?? (owner || management ? 0.4 : 0);
  const confidence = searchUsed ? rawConfidence : Math.min(rawConfidence, 0.4);
  const status: HotelRecord['status'] =
    !searchUsed || (!owner && !management) || confidence < threshold ? 'needs_review' : 'auto';

  const phone = clean(g.phone);
  return hotelRecordSchema.parse({
    slug: hotelSlug(task.inputName, task.city),
    inputName: task.inputName,
    name: clean(g.name) ?? task.inputName,
    city: task.city,
    country: task.country,
    category: clean(g.category),
    phone,
    phoneE164: toE164(phone, task.country),
    email: clean(g.email)?.toLowerCase() ?? null,
    website: cleanUrl(g.website),
    district: clean(g.district),
    address: clean(g.address),
    latitude: typeof g.latitude === 'number' && Number.isFinite(g.latitude) ? g.latitude : null,
    longitude: typeof g.longitude === 'number' && Number.isFinite(g.longitude) ? g.longitude : null,
    owner,
    management,
    governanceConfidence: Math.max(0, Math.min(1, confidence)),
    sources: sources.filter((s) => /^https?:\/\//.test(s)),
    status,
    model,
    enrichedAt: new Date().toISOString(),
  });
}

export interface RunOptions {
  tasks: HotelTask[];
  store: RecordStore;
  notion?: NotionSink;
  force?: boolean;
  signal?: AbortSignal;
}

export interface RunSummary {
  total: number;
  enriched: number;
  skipped: number;
  failed: number;
  needsReview: number;
  notionCreated: number;
  notionUpdated: number;
}

export async function runEnrichment(
  ai: GoogleGenAI,
  config: AppConfig,
  options: RunOptions,
): Promise<RunSummary> {
  const { tasks, store, notion } = options;
  const s: RunSummary = {
    total: tasks.length,
    enriched: 0,
    skipped: 0,
    failed: 0,
    needsReview: 0,
    notionCreated: 0,
    notionUpdated: 0,
  };

  for (let i = 0; i < tasks.length; i += 1) {
    if (options.signal?.aborted) {
      console.error(chalk.yellow('  interruption — arrêt propre'));
      break;
    }
    const task = tasks[i]!;
    const slug = hotelSlug(task.inputName, task.city);
    const tag = chalk.gray(`[${i + 1}/${tasks.length}]`);

    if (!options.force && store.has(slug)) {
      s.skipped += 1;
      console.error(`${tag} ${chalk.dim('· déjà traité')} ${task.inputName}`);
      continue;
    }

    try {
      const { data, sources } = await enrichHotel(ai, task, {
        model: config.geminiModel,
        maxRetries: config.maxRetries,
        search: config.geminiSearch,
      });
      const record = toRecord(
        task,
        data,
        sources,
        config.geminiModel,
        config.reviewConfidenceThreshold,
        config.geminiSearch,
      );
      store.upsert(record);
      s.enriched += 1;
      if (record.status === 'needs_review') s.needsReview += 1;

      const badge =
        record.status === 'needs_review' ? chalk.yellow('à vérifier') : chalk.green('ok');
      console.error(
        `${tag} ${badge} ${record.name} ${chalk.gray(
          `— ${record.owner ?? 'propriétaire ?'} · ${record.phoneE164 ?? 'tél ?'}`,
        )}`,
      );

      if (notion) {
        const outcome = await notion.upsert(record);
        if (outcome === 'created') s.notionCreated += 1;
        else s.notionUpdated += 1;
      }
    } catch (error) {
      s.failed += 1;
      console.error(`${tag} ${chalk.red('échec')} ${task.inputName}: ${(error as Error).message}`);
    }

    if (i < tasks.length - 1) await sleep(config.requestIntervalMs);
  }

  return s;
}
