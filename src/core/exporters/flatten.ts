import type { VestraLead } from '../types/lead.entity.js';

/** Deliverable columns, in order, with readable headers. */
export const LEAD_COLUMNS = [
  ['companyName', 'Establishment name'],
  ['legalName', 'Legal name'],
  ['category', 'Category'],
  ['chain', 'Chain'],
  ['city', 'City'],
  ['country', 'Country'],
  ['address', 'Full address'],
  ['phoneNormalized', 'Phone'],
  ['phones', 'Phones (all)'],
  ['email', 'General email'],
  ['emailStatus', 'Email status'],
  ['emails', 'Emails (all)'],
  ['websiteUrl', 'Website'],
  ['linkedin', 'LinkedIn'],
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['whatsapp', 'WhatsApp'],
  ['googleRating', 'Google rating'],
  ['reviewsCount', 'Reviews count'],
  ['reviewsSentiment', 'Reviews sentiment'],
  ['reviewsSummary', 'Reviews summary'],
  ['contactName', 'Decision-maker contact'],
  ['contactRole', 'Decision-maker role'],
  ['contactEmail', 'Decision-maker email'],
  ['contactLinkedin', 'Decision-maker LinkedIn'],
  ['source', 'Source'],
  ['sourceUrl', 'Source link'],
  ['id', 'ID'],
] as const;

export type FlatLead = Record<(typeof LEAD_COLUMNS)[number][0], string | number>;

/** Flattens a lead: the most reliable contact is lifted onto the row. */
export function flattenLead(lead: VestraLead): FlatLead {
  const best = [...lead.contacts].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
  return {
    companyName: lead.companyName,
    legalName: lead.legalName ?? '',
    category: lead.category ?? '',
    chain: lead.chain?.isChain ? (lead.chain.name ?? 'Yes') : '',
    city: lead.city,
    country: lead.country,
    address: lead.address ?? '',
    phoneNormalized: lead.phoneNormalized ?? '',
    phones: lead.phones.join(' / '),
    email: lead.email ?? '',
    emailStatus: lead.emailStatus ?? '',
    emails: lead.emails.join(' / '),
    websiteUrl: lead.websiteUrl ?? '',
    linkedin: lead.socials.linkedin ?? '',
    facebook: lead.socials.facebook ?? '',
    instagram: lead.socials.instagram ?? '',
    whatsapp: lead.socials.whatsapp ?? '',
    googleRating: lead.googleRating ?? '',
    reviewsCount: lead.reviewsCount ?? '',
    reviewsSentiment: lead.reviews?.sentiment ?? '',
    reviewsSummary: lead.reviews?.summary ?? '',
    contactName: best?.fullName ?? '',
    contactRole: best?.role ?? '',
    contactEmail: best?.emailDirect ?? '',
    contactLinkedin: best?.linkedinUrl ?? '',
    source: lead.source,
    sourceUrl: lead.sourceUrl ?? '',
    id: lead.id,
  };
}
