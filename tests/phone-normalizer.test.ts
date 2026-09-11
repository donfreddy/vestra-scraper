import { describe, it, expect } from 'vitest';
import { normalizePhone, toE164 } from '../src/index.js';

describe('normalizePhone (Cameroun)', () => {
  it('adds the country code to a 9-digit national number', () => {
    const n = normalizePhone('6 99 12 34 56', 'CM');
    expect(n.e164).toBe('+237699123456');
    expect(n.valid).toBe(true);
    expect(n.country).toBe('CM');
  });

  it('recognizes a number already in international format', () => {
    expect(toE164('+237 233 42 00 01', 'CM')).toBe('+237233420001');
  });

  it('cleans separators and the 00 prefix', () => {
    expect(toE164('00 237 6 99 00 00 00', 'CM')).toBe('+237699000000');
  });

  it('takes the first number when the field contains several', () => {
    const n = normalizePhone('+237 699 00 00 00 / 233 00 00 00', 'CM');
    expect(n.e164).toBe('+237699000000');
  });

  it('returns invalid for an empty string or noise', () => {
    expect(normalizePhone('', 'CM').valid).toBe(false);
    expect(normalizePhone('N/A', 'CM').valid).toBe(false);
  });
});
