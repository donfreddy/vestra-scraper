import * as cheerio from 'cheerio';

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** Résout le lien de redirection DuckDuckGo (`//duckduckgo.com/l/?uddg=...`) vers l'URL réelle. */
function resolveResultUrl(href: string): string {
  try {
    const u = new URL(href.startsWith('//') ? `https:${href}` : href, 'https://duckduckgo.com');
    const real = u.searchParams.get('uddg');
    return real ? decodeURIComponent(real) : u.toString();
  } catch {
    return href;
  }
}

/**
 * Recherche web gratuite via le point d'entrée HTML de DuckDuckGo (sans JS, sans clé API).
 * Best-effort : peut renvoyer un tableau vide si DuckDuckGo throttle/bloque la requête.
 */
export async function searchDuckDuckGo(query: string, maxResults = 6): Promise<WebResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  const results: WebResult[] = [];
  $('.result__body').each((_, el) => {
    if (results.length >= maxResults) return;
    const a = $(el).find('a.result__a').first();
    const title = a.text().trim();
    const url = resolveResultUrl(a.attr('href') ?? '');
    const snippet = $(el).find('.result__snippet').text().trim();
    if (title && /^https?:\/\//.test(url)) results.push({ title, url, snippet });
  });
  return results;
}

/** Récupère le texte visible d'une page (best-effort, dégrade en `null` sur tout échec). */
export async function fetchPageText(url: string, maxChars = 3000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) return null;

    const $ = cheerio.load(await res.text());
    $('script,style,nav,footer,noscript,header,svg').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}
