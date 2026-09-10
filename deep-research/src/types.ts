import { z } from 'zod';

/** Ce que le LLM est censé renvoyer (avant normalisation). */
export const geminiHotelSchema = z.object({
  name: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.coerce.number().nullable().optional(),
  longitude: z.coerce.number().nullable().optional(),
  owner: z.string().nullable().optional(),
  management: z.string().nullable().optional(),
  /** Auto-évaluation du modèle (0–1) sur owner + management. */
  governance_confidence: z.coerce.number().min(0).max(1).nullable().optional(),
});

export type GeminiHotel = z.infer<typeof geminiHotelSchema>;

export type RecordStatus = 'auto' | 'needs_review' | 'verified';

/** Enregistrement final, persisté localement et poussé dans Notion. */
export const hotelRecordSchema = z.object({
  slug: z.string(),
  inputName: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  category: z.string().nullable(),
  phone: z.string().nullable(),
  phoneE164: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  district: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  owner: z.string().nullable(),
  management: z.string().nullable(),
  governanceConfidence: z.number().min(0).max(1),
  sources: z.array(z.string().url()),
  status: z.enum(['auto', 'needs_review', 'verified']),
  model: z.string(),
  enrichedAt: z.string(),
});

export type HotelRecord = z.infer<typeof hotelRecordSchema>;

/** Format du fichier d'entrée : { "Ville": { country, hotels: [...] } }. */
export const inputFileSchema = z.record(
  z.object({
    country: z.string().min(1),
    hotels: z.array(z.string().min(1)),
  }),
);

export type InputFile = z.infer<typeof inputFileSchema>;

export interface HotelTask {
  inputName: string;
  city: string;
  country: string;
}

export function flattenInput(input: InputFile): HotelTask[] {
  const tasks: HotelTask[] = [];
  for (const [city, { country, hotels }] of Object.entries(input)) {
    for (const inputName of hotels) tasks.push({ inputName: inputName.trim(), city, country });
  }
  return tasks;
}
