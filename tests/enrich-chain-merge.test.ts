import { describe, it, expect } from 'vitest';
import { detectChains } from '../src/enrichers/chain.js';
import { applyPatch } from '../src/core/pipeline/merge.js';
import { normalizeLead } from '../src/core/pipeline/pipeline.js';

const lead = (over: Partial<Parameters<typeof normalizeLead>[0]> = {}) =>
  normalizeLead({ source: 'google-maps', companyName: 'X', city: 'Douala', ...over });

describe('detectChains', () => {
  it('marque une enseigne connue', () => {
    const leads = [lead({ companyName: 'Hilton Yaoundé', city: 'Yaoundé' })];
    detectChains(leads);
    expect(leads[0]!.chain).toMatchObject({ isChain: true, name: 'Hilton' });
  });

  it('détecte une marque présente dans plusieurs villes', () => {
    const leads = [
      lead({ companyName: 'Hôtel La Falaise', city: 'Douala' }),
      lead({ companyName: 'Hôtel La Falaise', city: 'Yaoundé' }),
      lead({ companyName: 'Auberge du Lac', city: 'Kribi' }),
    ];
    detectChains(leads);
    expect(leads[0]!.chain?.isChain).toBe(true);
    expect(leads[2]!.chain?.isChain).toBe(false);
  });
});

describe('applyPatch', () => {
  it('fusionne sans écraser et trace l’enricher', () => {
    const base = lead({ companyName: 'Hôtel Test', email: 'contact@test.cm' });
    const merged = applyPatch(
      base,
      {
        emails: ['contact@test.cm', 'reservation@test.cm'],
        phones: ['+237699000000'],
        socials: { facebook: 'https://facebook.com/test' },
        emailStatus: 'valid',
        email: 'autre@test.cm',
      },
      'website',
    );
    expect(merged.email).toBe('contact@test.cm'); // pas écrasé
    expect(merged.emails).toEqual(['contact@test.cm', 'reservation@test.cm']);
    expect(merged.socials.facebook).toBe('https://facebook.com/test');
    expect(merged.emailStatus).toBe('valid');
    expect(merged.enrichedBy).toContain('website');
  });
});
