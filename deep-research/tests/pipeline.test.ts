import { describe, it, expect } from 'vitest';
import { toRecord } from '../src/pipeline.js';
import { toE164 } from '../src/phone.js';
import type { HotelTask } from '../src/types.js';

const task: HotelTask = { inputName: 'Akwa Palace', city: 'Douala', country: 'Cameroun' };

describe('toE164', () => {
  it('normalizes a Cameroon number', () => {
    expect(toE164('699 00 00 00', 'Cameroun')).toBe('+237699000000');
  });
  it('normalizes an Ivory Coast number', () => {
    expect(toE164('27 20 30 40 50', "Côte d'Ivoire")).toBe('+2252720304050');
  });
  it('returns null for junk', () => {
    expect(toE164('N/A', 'Cameroun')).toBeNull();
    expect(toE164(null, 'Cameroun')).toBeNull();
  });
});

describe('toRecord', () => {
  it('marks needs_review when governance is missing', () => {
    const r = toRecord(task, { name: 'Akwa Palace', owner: null, management: null }, [], 'gemini-2.5-flash', 0.6);
    expect(r.status).toBe('needs_review');
    expect(r.owner).toBeNull();
    expect(r.slug).toBe('douala-akwapalace');
  });

  it('marks needs_review when confidence is below threshold', () => {
    const r = toRecord(
      task,
      { owner: 'Groupe X', management: 'M. Y', governance_confidence: 0.3 },
      ['https://example.cm'],
      'gemini-2.5-flash',
      0.6,
    );
    expect(r.status).toBe('needs_review');
  });

  it('accepts a well-sourced record and normalizes the phone', () => {
    const r = toRecord(
      task,
      {
        name: 'Hôtel Akwa Palace',
        owner: 'État du Cameroun',
        management: 'Jean Dupont',
        governance_confidence: 0.9,
        phone: '+237 233 42 26 01',
        email: 'INFO@AKWA-PALACE.COM',
      },
      ['https://akwa-palace.com'],
      'gemini-2.5-flash',
      0.6,
    );
    expect(r.status).toBe('auto');
    expect(r.phoneE164).toBe('+237233422601');
    expect(r.email).toBe('info@akwa-palace.com');
  });

  it('normalizes the website URL (adds scheme, trims trailing slash)', () => {
    const a = toRecord(task, { website: 'www.akwa-palace.com/' }, [], 'm', 0.6);
    expect(a.website).toBe('https://www.akwa-palace.com');
    const b = toRecord(task, { website: 'pas une url' }, [], 'm', 0.6);
    expect(b.website).toBeNull();
  });

  it('drops non-http sources', () => {
    const r = toRecord(task, { owner: 'X', governance_confidence: 0.9 }, ['not-a-url', 'https://ok.cm'], 'm', 0.6);
    expect(r.sources).toEqual(['https://ok.cm']);
  });

  it('forces needs_review and caps confidence when search was not used', () => {
    const r = toRecord(
      task,
      { owner: 'Groupe X', management: 'M. Y', governance_confidence: 0.95 },
      [],
      'm',
      0.6,
      false,
    );
    expect(r.status).toBe('needs_review');
    expect(r.governanceConfidence).toBeLessThanOrEqual(0.4);
  });
});
