import type { B2BLead } from '../types/lead.entity.js';

/** Colonnes du livrable client, dans l'ordre, avec en-têtes lisibles. */
export const LEAD_COLUMNS = [
  ['companyName', "Nom de l'établissement"],
  ['category', 'Catégorie'],
  ['city', 'Ville'],
  ['country', 'Pays'],
  ['address', 'Adresse complète'],
  ['phoneNormalized', 'Téléphone'],
  ['phoneRaw', 'Téléphone (brut)'],
  ['email', 'Email général'],
  ['websiteUrl', 'Site web'],
  ['googleRating', 'Note Google'],
  ['reviewsCount', 'Nb avis'],
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
    category: lead.category ?? '',
    city: lead.city,
    country: lead.country,
    address: lead.address ?? '',
    phoneNormalized: lead.phoneNormalized ?? '',
    phoneRaw: lead.phoneRaw ?? '',
    email: lead.email ?? '',
    websiteUrl: lead.websiteUrl ?? '',
    googleRating: lead.googleRating ?? '',
    reviewsCount: lead.reviewsCount ?? '',
    contactName: best?.fullName ?? '',
    contactRole: best?.role ?? '',
    contactEmail: best?.emailDirect ?? '',
    contactLinkedin: best?.linkedinUrl ?? '',
    source: lead.source,
    sourceUrl: lead.sourceUrl ?? '',
    id: lead.id,
  };
}
