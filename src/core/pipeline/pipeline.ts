import { createHash } from 'node:crypto';
import {
  b2bLeadSchema,
  leadContactSchema,
  ContactRole,
  type B2BLead,
  type RawLead,
} from '../types/lead.entity.js';
import { normalizeCity, cityKey } from './city-normalizer.js';
import { normalizePhone } from './phone-normalizer.js';
import { Deduplicator } from './deduplicator.js';
import type { Logger } from '../logger.js';

/** Id déterministe : même entreprise + ville + source => même id entre deux runs. */
export function buildLeadId(source: string, companyName: string, city: string): string {
  const basis = `${source}|${companyName.trim().toLowerCase()}|${cityKey(city)}`;
  return `${source}_${createHash('sha1').update(basis).digest('hex').slice(0, 16)}`;
}

const ROLE_HINTS: Array<[RegExp, ContactRole]> = [
  [/(directeur general|directrice generale|general manager|\bg\.?m\b|\bdg\b)/i, ContactRole.GeneralManager],
  [/(propri[ée]taire|owner|g[ée]rant|fondat)/i, ContactRole.Owner],
  [/(directeur|directrice|\bhead of\b|responsable)/i, ContactRole.Director],
  [/(manager|cadre|chef de)/i, ContactRole.Executive],
];

export function inferRole(titleRaw: string | undefined): ContactRole {
  if (!titleRaw) return ContactRole.Other;
  const normalized = titleRaw.normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [re, role] of ROLE_HINTS) {
    if (re.test(normalized) || re.test(titleRaw)) return role;
  }
  return ContactRole.Other;
}

function cleanUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    u.hash = '';
    return u.toString();
  } catch {
    return undefined;
  }
}

function cleanEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const m = email.trim().toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return m ? m[0] : undefined;
}

export interface NormalizeOptions {
  defaultCountry?: string;
  /** Ville de repli si le scraper n'a pas su l'extraire (ex: la ville de la requête). */
  fallbackCity?: string;
}

/**
 * Valide et normalise un lead brut. Lève une `ZodError` si les champs
 * essentiels (nom, source) sont absents/invalides.
 */
export function normalizeLead(raw: RawLead, options: NormalizeOptions = {}): B2BLead {
  const country = (raw.country ?? options.defaultCountry ?? 'CM').toUpperCase();
  const city = normalizeCity(raw.city) || normalizeCity(options.fallbackCity) || '';

  const phone = normalizePhone(raw.phoneRaw ?? raw.phoneNormalized, country);

  const contacts = (raw.contacts ?? []).map((c) => {
    const titleRaw = c.titleRaw;
    return leadContactSchema.parse({
      fullName: c.fullName.trim(),
      role: c.role ?? inferRole(titleRaw),
      titleRaw: titleRaw?.trim(),
      emailDirect: cleanEmail(c.emailDirect),
      phoneDirect: c.phoneDirect ? normalizePhone(c.phoneDirect, country).e164 : undefined,
      linkedinUrl: cleanUrl(c.linkedinUrl),
      confidence: c.confidence ?? 1,
    });
  });

  const companyName = raw.companyName.replace(/\s+/g, ' ').trim();

  return b2bLeadSchema.parse({
    id: raw.id ?? buildLeadId(raw.source, companyName, city),
    source: raw.source,
    sourceUrl: cleanUrl(raw.sourceUrl),
    companyName,
    category: raw.category?.trim() || undefined,
    city,
    country: country.length === 2 ? country : 'CM',
    address: raw.address?.replace(/\s+/g, ' ').trim() || undefined,
    latitude: raw.latitude,
    longitude: raw.longitude,
    phoneRaw: raw.phoneRaw?.trim() || undefined,
    phoneNormalized: phone.e164,
    email: cleanEmail(raw.email),
    websiteUrl: cleanUrl(raw.websiteUrl),
    googleRating: raw.googleRating,
    reviewsCount: raw.reviewsCount,
    contacts,
    metadata: {
      ...(raw.metadata ?? {}),
      phoneValid: phone.valid,
    },
    scrapedAt: raw.scrapedAt ?? new Date(),
  });
}

export interface PipelineStats {
  received: number;
  invalid: number;
  duplicates: number;
  accepted: number;
}

/**
 * Pipeline de traitement en flux : valide -> normalise -> dédoublonne.
 * `run` consomme l'itérable du scraper et émet les leads propres et uniques.
 */
export class LeadPipeline {
  private readonly dedup = new Deduplicator();
  readonly stats: PipelineStats = { received: 0, invalid: 0, duplicates: 0, accepted: 0 };

  constructor(
    private readonly options: NormalizeOptions,
    private readonly logger: Logger,
  ) {}

  async *run(source: AsyncIterable<RawLead>): AsyncGenerator<B2BLead> {
    for await (const raw of source) {
      this.stats.received += 1;
      let lead: B2BLead;
      try {
        lead = normalizeLead(raw, this.options);
      } catch (error) {
        this.stats.invalid += 1;
        this.logger.debug('lead rejeté (validation):', (error as Error).message);
        continue;
      }

      const decision = this.dedup.inspect(lead);
      if (decision.duplicate) {
        this.stats.duplicates += 1;
        this.logger.debug(`doublon (${decision.reason}) ignoré: ${lead.companyName}`);
        continue;
      }
      this.dedup.remember(lead);
      this.stats.accepted += 1;
      yield lead;
    }
  }
}
