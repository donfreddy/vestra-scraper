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
  /** Id du lead déjà vu qui a provoqué le rejet. */
  matchedId?: string;
}

/**
 * Détecte les doublons sur trois signaux successifs :
 *  1. nom d'entreprise normalisé + ville
 *  2. téléphone E.164
 *  3. domaine du site web
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

  /** Enregistre le lead comme "vu". À n'appeler que pour les non-doublons. */
  remember(lead: B2BLead): void {
    if (companyKey(lead.companyName)) {
      this.byNameCity.set(`${companyKey(lead.companyName)}::${cityKey(lead.city)}`, lead.id);
    }
    if (lead.phoneNormalized) this.byPhone.set(lead.phoneNormalized, lead.id);
    const domain = Deduplicator.domainOf(lead.websiteUrl);
    if (domain) this.byDomain.set(domain, lead.id);
  }

  /** Combine `inspect` + `remember`. Retourne `true` si le lead est un doublon. */
  isDuplicate(lead: B2BLead): boolean {
    const decision = this.inspect(lead);
    if (!decision.duplicate) this.remember(lead);
    return decision.duplicate;
  }

  get size(): number {
    return this.byNameCity.size;
  }
}
