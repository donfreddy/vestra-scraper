/**
 * Normalization of city names (main Cameroonian agglomerations +
 * frequent variants). Used for deduplication and deliverable consistency
 * ("Dla", "DOUALA", "douala " -> "Douala").
 */

const ALIASES: Record<string, string> = {
  dla: 'Douala',
  douala: 'Douala',
  yde: 'Yaoundé',
  yaounde: 'Yaoundé',
  kribi: 'Kribi',
  limbe: 'Limbé',
  buea: 'Buéa',
  bafoussam: 'Bafoussam',
  bamenda: 'Bamenda',
  garoua: 'Garoua',
  maroua: 'Maroua',
  ngaoundere: 'Ngaoundéré',
  bertoua: 'Bertoua',
  ebolowa: 'Ebolowa',
  edea: 'Édéa',
  kumba: 'Kumba',
  dschang: 'Dschang',
  nkongsamba: 'Nkongsamba',
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Canonical readable version (with accents) of a city name. */
export function normalizeCity(raw: string | undefined): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[,–-].*$/, '') // "Douala, Littoral" -> "Douala"
    .trim();
  if (!cleaned) return '';

  const key = stripDiacritics(cleaned).toLowerCase();
  const alias = ALIASES[key];
  if (alias) return alias;

  return cleaned
    .toLocaleLowerCase('fr')
    .split(' ')
    .map((w) => (w ? w[0]!.toLocaleUpperCase('fr') + w.slice(1) : w))
    .join(' ');
}

/** Case/accent-insensitive key used to compare two cities. */
export function cityKey(raw: string | undefined): string {
  return stripDiacritics(normalizeCity(raw)).toLowerCase().replace(/[^a-z0-9]/g, '');
}
