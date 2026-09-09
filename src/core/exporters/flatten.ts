import type { B2BLead } from '../types/lead.entity.js';

/** Colonnes du livrable client, dans l'ordre, avec en-têtes lisibles. */
export const LEAD_COLUMNS = [
  ['companyName', "Nom de l'établissement"],
  ['legalName', 'Raison sociale'],
  ['category', 'Catégorie'],
  ['chain', 'Chaîne'],
  ['city', 'Ville'],
  ['country', 'Pays'],
  ['address', 'Adresse complète'],
  ['phoneNormalized', 'Téléphone'],
  ['phones', 'Téléphones (tous)'],
  ['email', 'Email général'],
  ['emailStatus', 'Statut email'],
  ['emails', 'Emails (tous)'],
  ['websiteUrl', 'Site web'],
  ['linkedin', 'LinkedIn'],
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['whatsapp', 'WhatsApp'],
  ['googleRating', 'Note Google'],
  ['reviewsCount', 'Nb avis'],
  ['reviewsSentiment', 'Sentiment avis'],
  ['reviewsSummary', 'Résumé avis'],
  ['contactName', 'Contact décideur'],
  ['contactRole', 'Poste décideur'],
  ['contactEmail', 'Email décideur'],
  ['contactLinkedin', 'LinkedIn décideur'],
  ['source', 'Source'],
  ['sourceUrl', 'Lien source'],
  ['id', 'ID'],
] as const;

export type FlatLead = Record<(typeof LEAD_COLUMNS)[number][0], string | number>;

/** Aplati un lead : on remonte le 1er contact "le plus fiable" sur la ligne. */
export function flattenLead(lead: B2BLead): FlatLead {
  const best = [...lead.contacts].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
  return {
    companyName: lead.companyName,
    legalName: lead.legalName ?? '',
    category: lead.category ?? '',
    chain: lead.chain?.isChain ? (lead.chain.name ?? 'Oui') : '',
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
