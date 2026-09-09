import { z } from 'zod';

/**
 * Rôle normalisé d'un décideur rattaché à une entreprise.
 * `titleRaw` conserve l'intitulé exact trouvé sur la source.
 */
export const ContactRole = {
  GeneralManager: 'GENERAL_MANAGER',
  Owner: 'OWNER',
  Director: 'DIRECTOR',
  Executive: 'EXECUTIVE',
  Other: 'OTHER',
} as const;

export type ContactRole = (typeof ContactRole)[keyof typeof ContactRole];

export const leadContactSchema = z.object({
  fullName: z.string().min(1),
  role: z.nativeEnum(ContactRole).default(ContactRole.Other),
  titleRaw: z.string().optional(),
  emailDirect: z.string().email().optional(),
  phoneDirect: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  /** 0..1 — confiance dans l'exactitude du contact (1 = source directe). */
  confidence: z.number().min(0).max(1).default(1),
});

export type LeadContact = z.infer<typeof leadContactSchema>;

/**
 * Entité unifiée produite par toutes les stratégies de scraping.
 * Toute source (Google Maps, annuaire, site web) est normalisée vers ce modèle.
 */
export const b2bLeadSchema = z.object({
  /** Identifiant stable et déterministe (voir `buildLeadId`). */
  id: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: z.string().url().optional(),

  companyName: z.string().min(1),
  category: z.string().optional(),

  city: z.string().default(''),
  country: z.string().length(2).default('CM'),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  phoneRaw: z.string().optional(),
  phoneNormalized: z.string().optional(),
  email: z.string().email().optional(),
  websiteUrl: z.string().url().optional(),

  googleRating: z.number().min(0).max(5).optional(),
  reviewsCount: z.number().int().nonnegative().optional(),

  contacts: z.array(leadContactSchema).default([]),
  metadata: z.record(z.unknown()).default({}),

  scrapedAt: z.coerce.date().default(() => new Date()),
});

export type B2BLead = z.infer<typeof b2bLeadSchema>;

/** Forme brute acceptée avant validation/normalisation par le pipeline. */
export type RawLead = Partial<Omit<B2BLead, 'contacts' | 'metadata'>> & {
  companyName: string;
  source: string;
  contacts?: Array<Partial<LeadContact> & { fullName: string }>;
  metadata?: Record<string, unknown>;
};
