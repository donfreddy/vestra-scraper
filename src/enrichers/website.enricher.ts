import type { CheerioAPI } from 'cheerio';
import type { B2BLead } from '../core/types/lead.entity.js';
import type { EnrichContext, IEnricher, LeadPatch } from '../core/types/enricher.interface.js';
import { leadContactSchema } from '../core/types/lead.entity.js';
import { extractContacts, extractEmails, extractLegalName, extractPhones, extractSocials } from './extract.js';

/** Chemins courants où trouver des coordonnées / une équipe. */
const CANDIDATE_PATHS = [
  '',
  '/contact',
  '/contact-us',
  '/contactez-nous',
  '/nous-contacter',
  '/about',
  '/a-propos',
  '/a-propos-de-nous',
  '/equipe',
  '/notre-equipe',
  '/team',
  '/mentions-legales',
  '/impressum',
];

export interface WebsiteEnricherOptions {
  /** Nombre max de pages visitées par site (défaut 4). */
  maxPages?: number;
}

/**
 * Enrichit un lead à partir de son site web : e-mails, téléphones additionnels,
 * réseaux sociaux, raison sociale et — de façon heuristique — des contacts
 * nominatifs (« Nom — Directeur »).
 */
export class WebsiteEnricher implements IEnricher {
  readonly name = 'website';
  private readonly maxPages: number;

  constructor(options: WebsiteEnricherOptions = {}) {
    this.maxPages = Math.max(1, options.maxPages ?? 4);
  }

  supports(lead: B2BLead): boolean {
    return Boolean(lead.websiteUrl);
  }

  async enrich(lead: B2BLead, ctx: EnrichContext): Promise<LeadPatch> {
    const log = ctx.logger.child(this.name);
    const base = new URL(lead.websiteUrl!);

    const emails = new Set<string>(lead.emails);
    const phones = new Set<string>(lead.phones);
    let socials = { ...lead.socials };
    let legalName: string | undefined;
    const contacts = new Map<string, ReturnType<typeof leadContactSchema.parse>>();

    let visited = 0;
    for (const path of CANDIDATE_PATHS) {
      if (visited >= this.maxPages || ctx.signal?.aborted) break;
      const url = new URL(path, base).toString();

      let $: CheerioAPI;
      try {
        $ = await ctx.http.getDom(url);
      } catch (error) {
        if (path === '') log.debug(`site injoignable: ${(error as Error).message}`);
        continue;
      }
      visited += 1;

      const html = $.html();
      const bodyText = $('body').text();
      const hrefs = $('a[href]')
        .map((_, el) => $(el).attr('href') ?? '')
        .get()
        .map((h) => {
          try {
            return new URL(h, base).toString();
          } catch {
            return h;
          }
        });

      for (const e of extractEmails(html)) {
        if (isRelevantEmail(e, base.hostname)) emails.add(e);
      }

      const telHrefs = hrefs
        .filter((h) => h.startsWith('tel:'))
        .map((h) => decodeURIComponent(h.slice(4)));
      for (const p of extractPhones([...telHrefs, bodyText], ctx.country)) phones.add(p);

      socials = { ...extractSocials(hrefs), ...socials };

      legalName ??= extractLegalName(bodyText);

      for (const c of extractContacts(bodyText)) {
        const parsed = leadContactSchema.parse({
          fullName: c.fullName,
          role: c.role,
          titleRaw: c.titleRaw,
          confidence: c.confidence,
        });
        if (!contacts.has(parsed.fullName.toLowerCase())) {
          contacts.set(parsed.fullName.toLowerCase(), parsed);
        }
      }
    }

    // Rattache un e-mail nominatif probable à chaque contact (prenom@ / p.nom@).
    const mergedContacts = mergeContacts(lead.contacts, [...contacts.values()], [...emails]);

    const primaryEmail =
      lead.email ??
      [...emails].find((e) => /^(contact|info|reservation|reservations|hello|welcome)@/.test(e)) ??
      [...emails][0];

    const patch: LeadPatch = {
      emails: [...emails],
      phones: [...phones],
      socials,
      contacts: mergedContacts,
    };
    if (primaryEmail && primaryEmail !== lead.email) patch.email = primaryEmail;
    if (legalName) patch.legalName = legalName;

    log.debug(
      `${lead.companyName}: ${emails.size} e-mail(s), ${phones.size} tél, ${mergedContacts.length} contact(s)`,
    );
    return patch;
  }
}

function isRelevantEmail(email: string, hostname: string): boolean {
  const domain = email.split('@')[1] ?? '';
  const root = hostname.replace(/^www\./, '');
  // même domaine, ou fournisseur générique (petites structures)
  return domain === root || /(gmail|yahoo|hotmail|outlook|icloud)\.[a-z]+$/.test(domain);
}

type ParsedContact = ReturnType<typeof leadContactSchema.parse>;

function mergeContacts(existing: ParsedContact[], found: ParsedContact[], emails: string[]): ParsedContact[] {
  const byName = new Map<string, ParsedContact>();
  for (const c of [...existing, ...found]) {
    const key = c.fullName.toLowerCase();
    const prev = byName.get(key);
    byName.set(key, prev ? { ...prev, ...c, confidence: Math.max(prev.confidence, c.confidence) } : c);
  }

  for (const c of byName.values()) {
    if (c.emailDirect) continue;
    const [first = '', last = ''] = c.fullName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/);
    const guess = emails.find((e) => {
      const local = e.split('@')[0] ?? '';
      return (
        local === first ||
        local === `${first}.${last}` ||
        local === `${first[0] ?? ''}.${last}` ||
        local === `${first}${last}` ||
        local === `${first[0] ?? ''}${last}`
      );
    });
    if (guess) c.emailDirect = guess;
  }

  return [...byName.values()];
}
