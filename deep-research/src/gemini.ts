import { GoogleGenAI, Type, type Schema } from '@google/genai';
import pRetry, { AbortError } from 'p-retry';
import { geminiHotelSchema, type GeminiHotel, type HotelTask } from './types.js';
import type { WebContext } from './websearch.js';

export function createGemini(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

interface CallOptions {
  model: string;
  maxRetries: number;
}

export interface EnrichResult {
  data: GeminiHotel;
  sources: string[];
}

// ------------------------------------------------------------------
// Erreurs
// ------------------------------------------------------------------

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

function friendlyError(error: unknown, usedGoogleGrounding: boolean): Error {
  if (isQuotaExhausted(error)) {
    const hint = usedGoogleGrounding
      ? "Quota Gemini dépassé. Le Google Search grounding n'est pas couvert par le tier gratuit sur ce modèle. " +
        'Options : activer la facturation sur ton projet Google AI, OU utiliser SEARCH_PROVIDER=duckduckgo ' +
        '(recherche web gratuite, sans clé, déjà le mode par défaut).'
      : 'Quota Gemini dépassé (requêtes/jour du tier gratuit). Réessaie demain, ou espace les requêtes ' +
        '(REQUEST_INTERVAL_MS plus grand).';
    return new Error(hint);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number, usedGoogleGrounding: boolean): Promise<T> {
  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (error) {
        if (isPermanent(error)) throw new AbortError(friendlyError(error, usedGoogleGrounding));
        throw error;
      }
    },
    { retries: maxRetries, minTimeout: 5000, factor: 2, randomize: true },
  );
}

// ------------------------------------------------------------------
// Schéma de sortie structurée (utilisable dès qu'aucun `tool` n'est actif —
// Gemini interdit de combiner `googleSearch` et `responseSchema`).
// ------------------------------------------------------------------

const HOTEL_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING, nullable: true, description: 'Nombre d’étoiles ou standing' },
    phone: { type: Type.STRING, nullable: true },
    email: { type: Type.STRING, nullable: true },
    website: { type: Type.STRING, nullable: true },
    district: { type: Type.STRING, nullable: true },
    address: { type: Type.STRING, nullable: true },
    latitude: { type: Type.NUMBER, nullable: true },
    longitude: { type: Type.NUMBER, nullable: true },
    owner: { type: Type.STRING, nullable: true, description: 'Propriétaire, promoteur ou groupe hôtelier parent' },
    management: { type: Type.STRING, nullable: true, description: 'Directeur général / gérant actuel' },
    governance_confidence: {
      type: Type.NUMBER,
      description: '0 à 1 : confiance réelle sur owner + management d’après les sources fournies',
    },
  },
  required: ['name'],
};

const DISCOVERY_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    hotels: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['hotels'],
};

function parseJsonResponse(text: string | undefined): unknown {
  const raw = (text ?? '').trim();
  if (!raw) throw new Error('réponse Gemini vide');
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) throw new Error('réponse Gemini non-JSON');
    return JSON.parse(raw.slice(start, end + 1));
  }
}

// ------------------------------------------------------------------
// Mode par défaut (gratuit) : contexte DuckDuckGo -> sortie structurée
// ------------------------------------------------------------------

/**
 * Enrichit un hôtel à partir d'un contexte web déjà collecté (DuckDuckGo).
 * Le prompt interdit explicitement de compléter avec des connaissances
 * générales non confirmées par le contexte, pour limiter l'hallucination.
 */
export async function enrichHotelFromContext(
  ai: GoogleGenAI,
  task: HotelTask,
  context: WebContext,
  opts: CallOptions,
): Promise<EnrichResult> {
  const prompt = `Tu es un analyste d'investigation B2B. On te donne des résultats de recherche web concernant
l'établissement hôtelier "${task.inputName}", situé à ${task.city}, ${task.country}.

${context.text || '(Aucun résultat web trouvé pour cette recherche.)'}

Consignes strictes :
- Base-toi UNIQUEMENT sur les informations ci-dessus. N'utilise PAS de connaissances générales non confirmées ici.
- Si une information n'apparaît pas explicitement dans le contexte, renvoie null pour ce champ.
- N'invente jamais un nom de propriétaire ou de directeur : si le contexte ne le cite pas nommément, mets null.
- governance_confidence : 0 si le contexte ne mentionne pas explicitement owner/management, proche de 1 si une source cite un nom précis avec son rôle.`;

  const data = await withRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: HOTEL_RESPONSE_SCHEMA, temperature: 0.1 },
      });
      return geminiHotelSchema.parse(parseJsonResponse(response.text));
    },
    opts.maxRetries,
    false,
  );

  return { data, sources: context.sources };
}

/** Extrait des noms d'hôtels plausibles à partir d'un contexte web DuckDuckGo agrégé. */
export async function discoverHotelsFromContext(
  ai: GoogleGenAI,
  city: string,
  country: string,
  context: WebContext,
  opts: CallOptions,
): Promise<{ hotels: string[] }> {
  const prompt = `Voici des résultats de recherche web sur les hôtels de ${city}, ${country} :

${context.text || '(aucun résultat)'}

À partir de CES résultats uniquement, extrait la liste des noms officiels d'établissements
hôteliers distincts qui y sont cités (pas de doublons, pas de résidences purement privées).
Si le contexte ne permet d'identifier aucun hôtel, renvoie une liste vide.`;

  const parsed = await withRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: DISCOVERY_RESPONSE_SCHEMA,
          temperature: 0.1,
        },
      });
      return parseJsonResponse(response.text) as { hotels?: unknown };
    },
    opts.maxRetries,
    false,
  );

  const hotels = Array.isArray(parsed.hotels)
    ? parsed.hotels.filter((h): h is string => typeof h === 'string' && h.trim().length > 1).map((h) => h.trim())
    : [];
  return { hotels: [...new Set(hotels)] };
}

// ------------------------------------------------------------------
// Mode payant : Google Search grounding natif de Gemini (SEARCH_PROVIDER=google)
// ------------------------------------------------------------------

function collectGroundingSources(response: unknown): string[] {
  const chunks =
    (
      response as {
        candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> } }>;
      }
    )?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const urls = new Set<string>();
  for (const c of chunks) if (c.web?.uri) urls.add(c.web.uri);
  return [...urls].slice(0, 8);
}

const GROUNDED_ENRICH_KEYS = [
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

export async function enrichHotelGrounded(ai: GoogleGenAI, task: HotelTask, opts: CallOptions): Promise<EnrichResult> {
  const prompt = `Tu es un analyste d'investigation B2B. Effectue une recherche web approfondie sur l'établissement hôtelier :
"${task.inputName}", situé à ${task.city}, ${task.country}.

Croise Google Maps, les sites de réservation, la presse locale, LinkedIn et les registres d'entreprises.

Renvoie UNIQUEMENT un objet JSON valide (aucun texte autour) avec ces clés :
${GROUNDED_ENRICH_KEYS.map((k) => `- ${k}`).join('\n')}

Règles :
- Si une information est réellement introuvable, mets null (n'invente jamais un nom de propriétaire ou de directeur).
- governance_confidence doit refléter honnêtement la fiabilité de tes sources pour owner et management.`;

  const { text, sources } = await withRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
      });
      const t = response.text ?? '';
      if (!t.trim()) throw new Error('réponse Gemini vide');
      return { text: t, sources: collectGroundingSources(response) };
    },
    opts.maxRetries,
    true,
  );

  const data = geminiHotelSchema.parse(parseJsonResponse(text));
  return { data, sources };
}

export async function discoverHotelsGrounded(
  ai: GoogleGenAI,
  city: string,
  country: string,
  opts: CallOptions,
): Promise<{ hotels: string[] }> {
  const prompt = `Effectue une recherche exhaustive et liste TOUS les établissements hôteliers connus (hôtels 1 à 5 étoiles, résidences hôtelières de standing, complexes) situés à ${city}, ${country}.

Renvoie UNIQUEMENT un objet JSON valide : { "hotels": ["Nom officiel 1", "Nom officiel 2", ...] }
- Uniquement les noms officiels exacts, sans doublon, sans les résidences purement privées.`;

  const { text } = await withRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
      });
      const t = response.text ?? '';
      if (!t.trim()) throw new Error('réponse Gemini vide');
      return { text: t };
    },
    opts.maxRetries,
    true,
  );

  const parsed = parseJsonResponse(text) as { hotels?: unknown };
  const hotels = Array.isArray(parsed.hotels)
    ? parsed.hotels.filter((h): h is string => typeof h === 'string' && h.trim().length > 1).map((h) => h.trim())
    : [];
  return { hotels: [...new Set(hotels)] };
}
