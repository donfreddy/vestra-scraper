import { ContactRole, type SocialLinks } from '../core/types/lead.entity.js';
import { normalizePhone } from '../core/pipeline/phone-normalizer.js';
import { inferRole } from '../core/pipeline/pipeline.js';

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;

/** Frequent file extensions / false positives in the scanned "emails". */
const EMAIL_BLOCKLIST = [
  /\.(png|jpe?g|gif|svg|webp|css|js|ico)$/i,
  /@(sentry|wix|wixpress|example|domain|email|sentry\.io|2x|3x)\b/i,
  /^[a-f0-9]{16,}@/i, // hashes
  /\b(u003e|u003c)/i,
];

export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  for (const raw of html.match(EMAIL_RE) ?? []) {
    const email = raw.toLowerCase().replace(/\.$/, '');
    if (EMAIL_BLOCKLIST.some((re) => re.test(email))) continue;
    if (email.length > 100) continue;
    found.add(email);
  }
  return [...found];
}

/** Numbers spotted in the text + `tel:` attributes, normalized to E.164. */
export function extractPhones(candidates: Iterable<string>, country: string): string[] {
  const out = new Set<string>();
  for (const cand of candidates) {
    for (const chunk of cand.split(/[,;/]|\s{2,}/)) {
      const n = normalizePhone(chunk, country);
      if (n.valid && n.e164) out.add(n.e164);
    }
  }
  return [...out];
}

const SOCIAL_MATCHERS: Array<[keyof SocialLinks, RegExp]> = [
  ['linkedin', /(?:[a-z]+\.)?linkedin\.com\/(company|in|pub)\//i],
  ['facebook', /(?:[a-z]+\.)?facebook\.com\/(?!sharer|share\.php|tr\?)/i],
  ['instagram', /(?:[a-z]+\.)?instagram\.com\/(?!p\/)/i],
  ['twitter', /(?:[a-z]+\.)?(twitter|x)\.com\/(?!intent|share)/i],
  ['youtube', /(?:[a-z]+\.)?youtube\.com\/(channel|c|user|@)/i],
  ['tiktok', /(?:[a-z]+\.)?tiktok\.com\/@/i],
];

export function extractSocials(hrefs: Iterable<string>): SocialLinks {
  const socials: SocialLinks = {};
  for (const href of hrefs) {
    if (!/^https?:\/\//i.test(href)) continue;
    for (const [key, re] of SOCIAL_MATCHERS) {
      if (!socials[key] && re.test(href)) {
        socials[key] = href.split('?')[0]!.replace(/\/$/, '');
      }
    }
    const wa = href.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\+?\d{6,15})/i);
    if (wa && !socials.whatsapp) socials.whatsapp = `+${wa[1]!.replace(/^\+/, '')}`;
  }
  return socials;
}

const LEGAL_RE =
  /\b([A-ZÀ-Ÿ][\w&'.\- ]{2,60}?)\s+(S\.?A\.?R\.?L\.?|SARL|S\.?A\.?|SA|SNC|GIE|E\.?U\.?R\.?L\.?|SUARL|SAS)\b/;

export function extractLegalName(text: string): string | undefined {
  const m = new RegExp(LEGAL_RE).exec(text.replace(/\s+/g, ' '));
  if (!m) return undefined;
  return `${m[1]!.trim()} ${m[2]!.replaceAll('.', '').toUpperCase()}`.trim();
}

const NAME = "[A-ZÀ-Ÿ][\\p{L}'’-]+(?:\\s+[A-ZÀ-Ÿ][\\p{L}'’.-]+){1,2}";
const TITLE =
  "(Directeur[a-zà-ÿ ]*Général[e]?|Directrice[a-zà-ÿ ]*Générale|Directeur[a-zà-ÿ]*|Directrice[a-zà-ÿ]*|General Manager|Général Manager|G[ée]rant[e]?|Propriétaire|Fondat[a-zà-ÿ]+|Manager|Responsable[a-zà-ÿ ]*)";

const CONTACT_RES = [
  new RegExp(`(${NAME})\\s*[,–—-]\\s*${TITLE}`, 'gu'),
  new RegExp(`${TITLE}\\s*[:–—-]\\s*(${NAME})`, 'gu'),
];

export interface ExtractedContact {
  fullName: string;
  titleRaw: string;
  role: ContactRole;
  confidence: number;
}

/** Spots "Name / Title" pairs in a page's visible text. Heuristic. */
export function extractContacts(text: string): ExtractedContact[] {
  const flat = text.replace(/\s+/g, ' ');
  const seen = new Map<string, ExtractedContact>();

  for (const [idx, re] of CONTACT_RES.entries()) {
    for (const m of flat.matchAll(re)) {
      const [name, title] = idx === 0 ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
      const fullName = name.trim();
      const titleRaw = title.trim().replace(/\s+/g, ' ');
      if (fullName.split(' ').length > 4) continue;
      const key = fullName.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, { fullName, titleRaw, role: inferRole(titleRaw), confidence: 0.55 });
      }
    }
  }
  return [...seen.values()];
}
