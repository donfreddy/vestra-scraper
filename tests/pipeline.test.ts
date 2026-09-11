import { describe, it, expect } from 'vitest';
import { normalizeLead, buildLeadId, inferRole, LeadPipeline } from '../src/index.js';
import { ContactRole, type RawLead } from '../src/index.js';
import { Logger } from '../src/index.js';

describe('normalizeLead', () => {
  it('normalizes city + phone and generates a deterministic id', () => {
    const a = normalizeLead({ source: 'google-maps', companyName: 'Hôtel X', city: 'dla', phoneRaw: '699000000' });
    const b = normalizeLead({ source: 'google-maps', companyName: 'Hôtel X', city: 'DOUALA' });
    expect(a.city).toBe('Douala');
    expect(a.phoneNormalized).toBe('+237699000000');
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(buildLeadId('google-maps', 'Hôtel X', 'Douala'));
  });

  it('rejects a lead without a name', () => {
    expect(() => normalizeLead({ source: 's' } as unknown as RawLead)).toThrow();
  });

  it('infers the decision-maker role from the title', () => {
    expect(inferRole('Directeur Général')).toBe(ContactRole.GeneralManager);
    expect(inferRole('Propriétaire & Fondateur')).toBe(ContactRole.Owner);
    expect(inferRole('Réceptionniste')).toBe(ContactRole.Other);
  });

  it('cleans a website without protocol and an email buried in text', () => {
    const lead = normalizeLead({
      source: 'x',
      companyName: 'Y',
      city: 'Kribi',
      websiteUrl: 'exemple.cm/contact',
      email: 'Write to Contact@Exemple.CM please',
    });
    expect(lead.websiteUrl).toBe('https://exemple.cm/contact');
    expect(lead.email).toBe('contact@exemple.cm');
  });
});

describe('LeadPipeline', () => {
  it('validates, deduplicates and counts', async () => {
    async function* source(): AsyncGenerator<RawLead> {
      yield { source: 'google-maps', companyName: 'Hôtel A', city: 'Douala' };
      yield { source: 'google-maps', companyName: 'HOTEL A', city: 'douala' }; // duplicate
      yield { source: 'google-maps', companyName: '', city: 'Douala' }; // invalid
      yield { source: 'google-maps', companyName: 'Hôtel B', city: 'Yaoundé' };
    }
    const pipeline = new LeadPipeline({ defaultCountry: 'CM' }, new Logger({ level: 'silent' }));
    const out = [];
    for await (const lead of pipeline.run(source())) out.push(lead);

    expect(out.map((l) => l.companyName)).toEqual(['Hôtel A', 'Hôtel B']);
    expect(pipeline.stats).toMatchObject({ received: 4, invalid: 1, duplicates: 1, accepted: 2 });
  });
});
