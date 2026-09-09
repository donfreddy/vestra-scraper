import type { RawLead } from '../../core/types/lead.entity.js';

/** Données brutes (chaînes issues du DOM) extraites d'une fiche Google Maps. */
export interface GmapsPlaceRaw {
  name: string;
  placeUrl?: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  ratingText?: string;
  reviewsText?: string;
  latitude?: number;
  longitude?: number;
}

const COUNTRY_WORDS = new Set(['cameroun', 'cameroon', 'nigeria', 'gabon', 'tchad', 'chad']);

/** "4,3" | "4.3 stars" -> 4.3 */
export function parseRating(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.replace(',', '.').match(/\d+(\.\d+)?/);
  if (!m) return undefined;
  const value = Number.parseFloat(m[0]);
  return value >= 0 && value <= 5 ? value : undefined;
}

/** "(1 234)" | "1,234 avis" | "1 234" -> 1234 */
export function parseReviews(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return undefined;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Devine la ville à partir d'une adresse Google Maps.
 * Heuristique : dernier segment hors "pays", en retirant un éventuel code postal.
 */
export function extractCityFromAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const segments = address
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return undefined;

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i]!;
    if (COUNTRY_WORDS.has(seg.toLowerCase())) continue;
    const cleaned = seg.replace(/\b\d{4,6}\b/g, '').replace(/\s+/g, ' ').trim();
    if (cleaned && !/^\d+$/.test(cleaned)) return cleaned;
  }
  return undefined;
}

/** `/maps/place/...!3d<lat>!4d<lng>` -> coordonnées. */
export function parseLatLngFromUrl(url: string | undefined): { latitude?: number; longitude?: number } {
  if (!url) return {};
  const m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return {};
  return { latitude: Number.parseFloat(m[1]!), longitude: Number.parseFloat(m[2]!) };
}

export interface ParseOptions {
  /** Ville de repli (celle de la requête) si l'adresse ne permet pas de la déduire. */
  fallbackCity?: string;
  country?: string;
}

export function toRawLead(place: GmapsPlaceRaw, options: ParseOptions = {}): RawLead {
  const fromUrl = parseLatLngFromUrl(place.placeUrl);
  const city = extractCityFromAddress(place.address) ?? options.fallbackCity;

  return {
    source: 'google-maps',
    sourceUrl: place.placeUrl,
    companyName: place.name.trim(),
    category: place.category?.trim(),
    city,
    country: options.country ?? 'CM',
    address: place.address?.trim(),
    latitude: place.latitude ?? fromUrl.latitude,
    longitude: place.longitude ?? fromUrl.longitude,
    phoneRaw: place.phone?.trim(),
    websiteUrl: place.website?.trim(),
    googleRating: parseRating(place.ratingText),
    reviewsCount: parseReviews(place.reviewsText),
    metadata: {},
  } as RawLead;
}
