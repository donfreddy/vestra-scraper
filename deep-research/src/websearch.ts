import pRetry from 'p-retry';
import { fetchPageText, searchDuckDuckGo, type WebResult } from './duckduckgo.js';
import type { HotelTask } from './types.js';

export interface WebContext {
  /** Texte formaté (extraits + pages) à injecter dans le prompt Gemini. */
  text: string;
  /** URLs effectivement utilisées — deviennent les "Sources" de l'enregistrement. */
  sources: string[];
}

export interface WebContextOptions {
  maxResults: number;
  fetchPages: number;
}

const EMPTY_CONTEXT: WebContext = { text: '', sources: [] };

/** 2 tentatives : DuckDuckGo renvoie parfois un ECONNRESET/timeout transitoire isolé. */
async function searchResilient(query: string, maxResults: number): Promise<WebResult[]> {
  try {
    return await pRetry(() => searchDuckDuckGo(query, maxResults), { retries: 2, minTimeout: 1500, factor: 2 });
  } catch {
    return [];
  }
}

function formatResults(results: WebResult[]): string {
  return results
    .map((r, i) => `[Résultat ${i + 1}] ${r.title}\nURL: ${r.url}\nExtrait: ${r.snippet || '(pas d’extrait)'}`)
    .join('\n\n');
}

/**
 * Construit le contexte web d'un hôtel via DuckDuckGo (gratuit, sans clé) :
 * recherche + extraits, et récupère en plus le texte complet des `fetchPages`
 * premiers résultats pour donner plus de matière au LLM.
 * Dégrade proprement (contexte vide) si DuckDuckGo est injoignable/throttle.
 */
export async function buildWebContext(task: HotelTask, options: WebContextOptions): Promise<WebContext> {
  const query = `"${task.inputName}" ${task.city} ${task.country} hôtel propriétaire directeur général adresse contact`;
  const results = await searchResilient(query, options.maxResults);
  if (results.length === 0) return EMPTY_CONTEXT;

  const sources = [...new Set(results.map((r) => r.url))];
  const parts = [formatResults(results)];

  for (const r of results.slice(0, options.fetchPages)) {
    const text = await fetchPageText(r.url);
    if (text) parts.push(`[Contenu complet de ${r.url}]\n${text}`);
  }

  return { text: parts.join('\n\n'), sources };
}

/**
 * Contexte web pour la découverte d'hôtels d'une ville : on privilégie la
 * largeur (plus de résultats, pas de récupération de pages) pour couvrir un
 * maximum de listes/annuaires différents plutôt qu'approfondir une seule page.
 */
export async function buildCityContext(city: string, country: string, maxResults: number): Promise<WebContext> {
  const results = await searchResilient(`liste hôtels ${city} ${country}`, maxResults);
  if (results.length === 0) return EMPTY_CONTEXT;

  return { text: formatResults(results), sources: [...new Set(results.map((r) => r.url))] };
}
