import type { VestraLead } from '../core/types/lead.entity.js';
import { cityKey } from '../core/pipeline/city-normalizer.js';

/** Known multi-site brands (Central African hospitality + international). */
export const KNOWN_CHAINS: Array<{ name: string; re: RegExp }> = [
  { name: 'Hilton', re: /\bhilton\b/i },
  { name: 'Ibis / Accor', re: /\b(ibis|novotel|mercure|pullman|sofitel|accor)\b/i },
  { name: 'Radisson', re: /\bradisson\b/i },
  { name: 'Marriott', re: /\bmarriott\b/i },
  { name: 'Best Western', re: /\bbest western\b/i },
  { name: 'Onomo', re: /\bonomo\b/i },
  { name: 'Azalaï', re: /\bazala[iï]\b/i },
  { name: 'La Falaise', re: /\b(h[oô]tel\s+)?la falaise\b/i },
  { name: 'Krystal Palace', re: /\bkrystal\b/i },
  { name: 'Star Land', re: /\bstar\s?land\b/i },
  { name: 'Résidence La Roseraie', re: /\bla roseraie\b/i },
];

function brandKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(h[oô]tel|resort|residence|auberge|motel|sarl|sa|the|le|la|les|de|du|des)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Marks each lead as belonging (or not) to a chain:
 *  - match with a known brand, or
 *  - same brand present in >= 2 distinct cities of the dataset.
 * Mutates `lead.chain` in place.
 */
export function detectChains(leads: VestraLead[]): void {
  const citiesByBrand = new Map<string, Set<string>>();
  const labelByBrand = new Map<string, string>();

  for (const lead of leads) {
    const key = brandKey(lead.companyName);
    if (!key) continue;
    if (!citiesByBrand.has(key)) citiesByBrand.set(key, new Set());
    citiesByBrand.get(key)!.add(cityKey(lead.city) || lead.id);
    if (!labelByBrand.has(key)) labelByBrand.set(key, lead.companyName.trim());
  }

  for (const lead of leads) {
    const known = KNOWN_CHAINS.find((c) => c.re.test(lead.companyName));
    if (known) {
      lead.chain = { isChain: true, name: known.name };
      continue;
    }
    const key = brandKey(lead.companyName);
    const cities = key ? citiesByBrand.get(key) : undefined;
    if (cities && cities.size >= 2) {
      lead.chain = { isChain: true, name: labelByBrand.get(key) };
    } else {
      lead.chain = { isChain: false };
    }
  }
}
