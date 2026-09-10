import { GoogleGenAI } from '@google/genai';
import pRetry, { AbortError } from 'p-retry';
import { geminiHotelSchema, type GeminiHotel, type HotelTask } from './types.js';

export function createGemini(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

interface CallOptions {
  model: string;
  maxRetries: number;
  /** Utiliser Google Search grounding (nécessite le tier payant Gemini pour certains modèles). */
  search: boolean;
}

export interface EnrichResult {
  data: GeminiHotel;
  sources: string[];
}

/** Extrait le premier objet JSON d'une réponse LLM (souvent entouré de texte). */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('aucun JSON dans la réponse');
  return JSON.parse(candidate.slice(start, end + 1));
}

function collectSources(response: unknown): string[] {
  const chunks =
    (response as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> } }> })
      ?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const urls = new Set<string>();
  for (const c of chunks) {
    if (c.web?.uri) urls.add(c.web.uri);
  }
  return [...urls].slice(0, 8);
}

function errorText(error: unknown): string {
  return String((error as Error)?.message ?? error).toLowerCase();
}

/** 429 lié au plan/facturation (ne se résoudra pas en retentant) vs simple rate-limit RPM. */
function isQuotaExhausted(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  const msg = errorText(error);
  if (status !== 429 && !/resource_exhausted|429/.test(msg)) return false;
  return /billing|check your plan|current quota|per day|daily|free tier/.test(msg);
}

function isPermanent(error: unknown): boolean {
  const msg = errorText(error);
  const status = (error as { status?: number }).status;
  if (status === 400 || status === 401 || status === 403 || status === 404) return true;
  if (isQuotaExhausted(error)) return true;
  return /api key|permission|invalid argument|unauthenticated/.test(msg);
}

function friendlyError(error: unknown, searchOn: boolean): Error {
  if (isQuotaExhausted(error)) {
    const hint = searchOn
      ? "Quota Gemini dépassé. Le Google Search grounding n'est pas couvert par le tier gratuit sur ce modèle. " +
        'Options : activer la facturation sur ton projet Google AI, OU mettre GEMINI_SEARCH=false dans .env ' +
        "(recherche via les connaissances du modèle seulement, sans sources — moins fiable)."
      : 'Quota Gemini dépassé (requêtes/jour du tier gratuit). Réessaie demain ou active la facturation.';
    return new Error(hint);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function callGemini(
  ai: GoogleGenAI,
  prompt: string,
  { model, maxRetries, search }: CallOptions,
): Promise<{ text: string; sources: string[] }> {
  return pRetry(
    async () => {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.2,
            ...(search ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        const text = response.text ?? '';
        if (!text.trim()) throw new Error('réponse Gemini vide');
        return { text, sources: search ? collectSources(response) : [] };
      } catch (error) {
        if (isPermanent(error)) throw new AbortError(friendlyError(error, search));
        throw error;
      }
    },
    { retries: maxRetries, minTimeout: 5000, factor: 2, randomize: true },
  );
}

const ENRICH_KEYS = [
  'name (nom officiel exact)',
  'category (nombre d’étoiles ou standing, ex: "4 étoiles")',
  'phone (numéro principal, format international si possible)',
  'email (email officiel de contact)',
  'website (site web officiel, URL complète, ou null)',
  'district (quartier précis)',
  'address (boîte postale / adresse physique)',
  'latitude (nombre décimal ou null)',
  'longitude (nombre décimal ou null)',
  'owner (propriétaire, promoteur ou groupe hôtelier parent)',
  'management (nom du directeur général / gérant actuel)',
  'governance_confidence (nombre 0 à 1 : ta confiance réelle sur owner + management)',
];

export async function enrichHotel(
  ai: GoogleGenAI,
  task: HotelTask,
  opts: CallOptions,
): Promise<EnrichResult> {
  const prompt = `Tu es un analyste d'investigation B2B. Effectue une recherche web approfondie sur l'établissement hôtelier :
"${task.inputName}", situé à ${task.city}, ${task.country}.

Croise Google Maps, les sites de réservation, la presse locale (Cameroon Tribune, Investir au Cameroun, Fraternité Matin…), LinkedIn et les registres d'entreprises.

Renvoie UNIQUEMENT un objet JSON valide (aucun texte autour) avec ces clés :
${ENRICH_KEYS.map((k) => `- ${k}`).join('\n')}

Règles :
- Si une information est réellement introuvable, mets null (n'invente jamais un nom de propriétaire ou de directeur).
- governance_confidence doit refléter honnêtement la fiabilité de tes sources pour owner et management (0 = pure supposition, 1 = source officielle explicite).`;

  const { text, sources } = await callGemini(ai, prompt, opts);
  const data = geminiHotelSchema.parse(extractJson(text));
  return { data, sources };
}

export interface DiscoverResult {
  hotels: string[];
  sources: string[];
}

export async function discoverHotels(
  ai: GoogleGenAI,
  city: string,
  country: string,
  opts: CallOptions,
): Promise<DiscoverResult> {
  const prompt = `Effectue une recherche exhaustive et liste TOUS les établissements hôteliers connus (hôtels 1 à 5 étoiles, résidences hôtelières de standing, complexes) situés à ${city}, ${country}.

Renvoie UNIQUEMENT un objet JSON valide : { "hotels": ["Nom officiel 1", "Nom officiel 2", ...] }
- Uniquement les noms officiels exacts, sans doublon, sans les résidences purement privées.`;

  const { text, sources } = await callGemini(ai, prompt, opts);
  const parsed = extractJson(text) as { hotels?: unknown };
  const hotels = Array.isArray(parsed.hotels)
    ? parsed.hotels.filter((h): h is string => typeof h === 'string' && h.trim().length > 1).map((h) => h.trim())
    : [];
  return { hotels: [...new Set(hotels)], sources };
}
