const STOPWORDS = new Set([
  'hotel',
  'lhotel',
  'the',
  'les',
  'le',
  'la',
  'residence',
  'residences',
  'suite',
  'suites',
  'spa',
  'complexe',
  'complex',
  'resort',
  'group',
  'groupe',
  'sa',
  'sarl',
  'sas',
  'luxury',
  'by',
  'and',
  'de',
  'des',
  'du',
]);

function strip(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Tokens significatifs d'un nom d'hôtel (sans accents, mots vides, tokens courts). */
export function tokens(name: string): string[] {
  return strip(name)
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Forme canonique compacte : tokens significatifs concaténés. */
export function canonicalName(name: string): string {
  return tokens(name).join('');
}

function canonicalCity(city: string): string {
  return strip(city).replace(/[^a-z0-9]+/g, '');
}

/**
 * Slug déterministe et lisible : même hôtel + même ville => même slug,
 * quel que soit le formatage d'entrée.
 * "Hôtel La Falaise (Bonapriso)" @ "Douala" -> "douala-falaisebonapriso"
 */
export function hotelSlug(name: string, city: string): string {
  return `${canonicalCity(city)}-${canonicalName(name) || 'inconnu'}`;
}

/**
 * Similarité 0–1 de deux noms d'hôtels, sur la base de leurs tokens
 * (robuste aux mots en plus/en moins et à l'ordre — ex: ajout du quartier).
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  if (inter === ta.size || inter === tb.size) return 0.95; // un ensemble inclus dans l'autre

  const union = ta.size + tb.size - inter;
  return inter / union;
}

export function isSameHotel(a: string, b: string, threshold = 0.6): boolean {
  return nameSimilarity(a, b) >= threshold;
}
