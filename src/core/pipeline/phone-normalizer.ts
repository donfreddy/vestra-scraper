import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export interface NormalizedPhone {
  e164?: string;
  national?: string;
  country?: string;
  valid: boolean;
}

/**
 * Normalise un numéro brut au format E.164 (`+237...`).
 * `defaultCountry` sert de repli quand le numéro n'a pas d'indicatif.
 */
export function normalizePhone(raw: string | undefined, defaultCountry = 'CM'): NormalizedPhone {
  if (!raw || !raw.trim()) return { valid: false };

  // Un même champ peut contenir plusieurs numéros ("+237 6xx / 2xx"). On prend le 1er.
  const firstChunk = raw.split(/[/;]|(?:\s{2,})/)[0]?.trim() ?? raw.trim();

  const parsed =
    parsePhoneNumberFromString(firstChunk, defaultCountry as CountryCode) ??
    parsePhoneNumberFromString(firstChunk);

  if (!parsed) return { valid: false };

  return {
    e164: parsed.number,
    national: parsed.formatNational(),
    country: parsed.country,
    valid: parsed.isValid(),
  };
}

/** Raccourci : renvoie l'E.164 si le numéro est valide, sinon `undefined`. */
export function toE164(raw: string | undefined, defaultCountry = 'CM'): string | undefined {
  const n = normalizePhone(raw, defaultCountry);
  return n.valid ? n.e164 : (n.e164 ?? undefined);
}
