import type { B2BLead } from '../types/lead.entity.js';
import { cityKey } from './city-normalizer.js';

function companyKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(h[oô]tel|sarl|sa|snc|gie|ets?|the|le|la|les)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface DedupeDecision {
  duplicate: boolean;
  reason?: 'name+city' | 'phone' | 'website';
  /** Id of the already seen lead that triggered the rejection. */
  matchedId?: string;
}

/**
 * Detects duplicates on three successive signals:
 *  1. normalized company name + city
 *  2. E.164 phone
 *  3. website domain
 */
export class Deduplicator {
  private readonly byNameCity = new Map<string, string>();
  private readonly byPhone = new Map<string, string>();
  private readonly byDomain = new Map<string, string>();

  private static domainOf(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return undefined;
    }
  }

  inspect(lead: B2BLead): DedupeDecision {
    const nameCity = `${companyKey(lead.companyName)}::${cityKey(lead.city)}`;
    if (companyKey(lead.companyName) && this.byNameCity.has(nameCity)) {
      return { duplicate: true, reason: 'name+city', matchedId: this.byNameCity.get(nameCity)! };
    }
    if (lead.phoneNormalized && this.byPhone.has(lead.phoneNormalized)) {
      return { duplicate: true, reason: 'phone', matchedId: this.byPhone.get(lead.phoneNormalized)! };
    }
    const domain = Deduplicator.domainOf(lead.websiteUrl);
    if (domain && this.byDomain.has(domain)) {
      return { duplicate: true, reason: 'website', matchedId: this.byDomain.get(domain)! };
    }
    return { duplicate: false };
  }

  /** Records the lead as "seen". Only call this for non-duplicates. */
  remember(lead: B2BLead): void {
    if (companyKey(lead.companyName)) {
      this.byNameCity.set(`${companyKey(lead.companyName)}::${cityKey(lead.city)}`, lead.id);
    }
    if (lead.phoneNormalized) this.byPhone.set(lead.phoneNormalized, lead.id);
    const domain = Deduplicator.domainOf(lead.websiteUrl);
    if (domain) this.byDomain.set(domain, lead.id);
  }

  /** Combines `inspect` + `remember`. Returns `true` if the lead is a duplicate. */
  isDuplicate(lead: B2BLead): boolean {
    const decision = this.inspect(lead);
    if (!decision.duplicate) this.remember(lead);
    return decision.duplicate;
  }

  get size(): number {
    return this.byNameCity.size;
  }
}
