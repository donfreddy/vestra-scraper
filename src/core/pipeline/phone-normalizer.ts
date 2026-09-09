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
 * Normalizes a raw number to E.164 format (`+237...`).
 * `defaultCountry` is used as a fallback when the number has no country code.
 */
export function normalizePhone(raw: string | undefined, defaultCountry = 'CM'): NormalizedPhone {
  if (!raw || !raw.trim()) return { valid: false };

  // A single field can contain several numbers ("+237 6xx / 2xx"). We take the first.
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

/** Shortcut: returns the E.164 if the number is valid, otherwise `undefined`. */
export function toE164(raw: string | undefined, defaultCountry = 'CM'): string | undefined {
  const n = normalizePhone(raw, defaultCountry);
  return n.valid ? n.e164 : (n.e164 ?? undefined);
}
