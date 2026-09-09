import type { B2BLead, LeadContact } from '../types/lead.entity.js';
import type { LeadPatch } from '../types/enricher.interface.js';

function uniq(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => v.trim()).filter(Boolean))];
}

function mergeContactList(current: LeadContact[], incoming: LeadContact[] | undefined): LeadContact[] {
  if (!incoming?.length) return current;
  const byName = new Map<string, LeadContact>();
  for (const c of [...current, ...incoming]) {
    const key = c.fullName.toLowerCase();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, c);
      continue;
    }
    byName.set(key, {
      ...prev,
      ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== '')),
      confidence: Math.max(prev.confidence, c.confidence),
    } as LeadContact);
  }
  return [...byName.values()];
}

/**
 * Merges an enricher `LeadPatch` into a lead. Non-destructive: values already
 * present are not overwritten by empty ones.
 */
export function applyPatch(lead: B2BLead, patch: LeadPatch, enricherName: string): B2BLead {
  const next: B2BLead = { ...lead };

  if (patch.emails) next.emails = uniq([...lead.emails, ...patch.emails]);
  if (patch.phones) next.phones = uniq([...lead.phones, ...patch.phones]);
  if (patch.socials) {
    next.socials = { ...lead.socials };
    for (const [k, v] of Object.entries(patch.socials)) {
      if (v && !next.socials[k as keyof typeof next.socials]) {
        next.socials[k as keyof typeof next.socials] = v;
      }
    }
  }
  next.contacts = mergeContactList(lead.contacts, patch.contacts);

  if (!next.email && patch.email) next.email = patch.email;
  if (patch.emailStatus) next.emailStatus = patch.emailStatus;
  if (patch.emailCatchAll !== undefined) next.emailCatchAll = patch.emailCatchAll;
  if (patch.legalName && !next.legalName) next.legalName = patch.legalName;
  if (patch.employeeRange && !next.employeeRange) next.employeeRange = patch.employeeRange;
  if (patch.chain) next.chain = patch.chain;
  if (patch.reviews) next.reviews = { ...next.reviews, ...patch.reviews };
  if (patch.category && !next.category) next.category = patch.category;

  if (patch.metadata) next.metadata = { ...lead.metadata, ...patch.metadata };
  next.enrichedBy = uniq([...lead.enrichedBy, enricherName]);

  return next;
}
