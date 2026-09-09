import { z } from 'zod';

/**
 * Normalized role of a decision-maker attached to a company.
 * `titleRaw` keeps the exact title found on the source.
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
  /** 0..1: confidence in the contact accuracy (1 = direct source). */
  confidence: z.number().min(0).max(1).default(1),
});

export type LeadContact = z.infer<typeof leadContactSchema>;

/**
 * Unified entity produced by every scraping strategy.
 * Any source (Google Maps, directory, website) is normalized to this model.
 */
export const socialLinksSchema = z.object({
  linkedin: z.string().url().optional(),
  facebook: z.string().url().optional(),
  instagram: z.string().url().optional(),
  twitter: z.string().url().optional(),
  youtube: z.string().url().optional(),
  tiktok: z.string().url().optional(),
  whatsapp: z.string().optional(),
});
export type SocialLinks = z.infer<typeof socialLinksSchema>;

export type EmailStatus = 'valid' | 'invalid' | 'risky' | 'unknown';

export const reviewsInsightSchema = z.object({
  count: z.number().int().nonnegative().optional(),
  average: z.number().min(0).max(5).optional(),
  summary: z.string().optional(),
  sentiment: z.enum(['positive', 'mixed', 'negative']).optional(),
  highlights: z.array(z.string()).default([]),
});
export type ReviewsInsight = z.infer<typeof reviewsInsightSchema>;

export const b2bLeadSchema = z.object({
  /** Stable and deterministic identifier (see `buildLeadId`). */
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

  // --- Fields populated by the enrichment step ---
  /** All emails found (the best one is also in `email`). */
  emails: z.array(z.string().email()).default([]),
  /** Additional numbers in E.164 format (the main one remains `phoneNormalized`). */
  phones: z.array(z.string()).default([]),
  socials: socialLinksSchema.default({}),
  emailStatus: z.enum(['valid', 'invalid', 'risky', 'unknown']).optional(),
  emailCatchAll: z.boolean().optional(),
  legalName: z.string().optional(),
  employeeRange: z.string().optional(),
  chain: z.object({ isChain: z.boolean(), name: z.string().optional() }).optional(),
  reviews: reviewsInsightSchema.optional(),
  /** Names of the enrichers applied to this lead. */
  enrichedBy: z.array(z.string()).default([]),

  contacts: z.array(leadContactSchema).default([]),
  metadata: z.record(z.unknown()).default({}),

  scrapedAt: z.coerce.date().default(() => new Date()),
});

export type B2BLead = z.infer<typeof b2bLeadSchema>;

/** Raw shape accepted before validation/normalization by the pipeline. */
export type RawLead = Partial<Omit<B2BLead, 'contacts' | 'metadata'>> & {
  companyName: string;
  source: string;
  contacts?: Array<Partial<LeadContact> & { fullName: string }>;
  metadata?: Record<string, unknown>;
};
