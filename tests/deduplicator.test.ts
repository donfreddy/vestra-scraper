import { describe, it, expect } from 'vitest';
import { Deduplicator } from '../src/index.js';
import { normalizeLead } from '../src/index.js';

const lead = (over: Partial<Parameters<typeof normalizeLead>[0]> = {}) =>
  normalizeLead({ source: 'google-maps', companyName: 'Hôtel Akwa Palace', city: 'Douala', ...over });

describe('Deduplicator', () => {
  it('detects the same establishment despite case/accents', () => {
    const d = new Deduplicator();
    expect(d.isDuplicate(lead())).toBe(false);
    expect(d.isDuplicate(lead({ companyName: 'HOTEL AKWA PALACE', city: 'DOUALA' }))).toBe(true);
  });

  it('matches two records by identical phone', () => {
    const d = new Deduplicator();
    d.isDuplicate(lead({ companyName: 'Résidence A', phoneRaw: '6 99 00 11 22' }));
    const decision = d.inspect(lead({ companyName: 'Autre Nom', city: 'Kribi', phoneRaw: '+237 699 001 122' }));
    expect(decision).toMatchObject({ duplicate: true, reason: 'phone' });
  });

  it('matches two records by website domain', () => {
    const d = new Deduplicator();
    d.isDuplicate(lead({ companyName: 'X', websiteUrl: 'https://www.hotel-x.cm/accueil' }));
    const decision = d.inspect(lead({ companyName: 'Y', city: 'Limbé', websiteUrl: 'http://hotel-x.cm' }));
    expect(decision).toMatchObject({ duplicate: true, reason: 'website' });
  });

  it('lets distinct establishments through', () => {
    const d = new Deduplicator();
    expect(d.isDuplicate(lead({ companyName: 'Hôtel A' }))).toBe(false);
    expect(d.isDuplicate(lead({ companyName: 'Hôtel B' }))).toBe(false);
  });
});
