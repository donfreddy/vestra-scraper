import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

const COUNTRY_TO_ISO: Record<string, CountryCode> = {
  cameroun: 'CM',
  cameroon: 'CM',
  "côte d'ivoire": 'CI',
  "cote d'ivoire": 'CI',
  'ivory coast': 'CI',
  senegal: 'SN',
  sénégal: 'SN',
  gabon: 'GA',
  benin: 'BJ',
  bénin: 'BJ',
  togo: 'TG',
  'burkina faso': 'BF',
  mali: 'ML',
  nigeria: 'NG',
};

export function isoForCountry(country: string): CountryCode | undefined {
  return COUNTRY_TO_ISO[country.trim().toLowerCase()];
}

/** Normalise un numéro brut au format E.164, en s'appuyant sur le pays de l'hôtel. */
export function toE164(raw: string | null | undefined, country: string): string | null {
  if (!raw) return null;
  const first = raw.split(/[/;]|(?:\s{2,})/)[0]?.trim() ?? raw.trim();
  const iso = isoForCountry(country);
  const parsed =
    (iso ? parsePhoneNumberFromString(first, iso) : undefined) ?? parsePhoneNumberFromString(first);
  return parsed?.isValid() ? parsed.number : (parsed?.number ?? null);
}
