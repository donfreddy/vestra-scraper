import { describe, it, expect } from 'vitest';
import { normalizeLead, buildLeadId, inferRole, LeadPipeline } from '../src/core/pipeline/pipeline.js';
import { ContactRole, type RawLead } from '../src/core/types/lead.entity.js';
import { Logger } from '../src/core/logger.js';

describe('normalizeLead', () => {
  it('normalise ville + téléphone et génère un id déterministe', () => {
    const a = normalizeLead({ source: 'google-maps', companyName: 'Hôtel X', city: 'dla', phoneRaw: '699000000' });
    const b = normalizeLead({ source: 'google-maps', companyName: 'Hôtel X', city: 'DOUALA' });
    expect(a.city).toBe('Douala');
    expect(a.phoneNormalized).toBe('+237699000000');
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(buildLeadId('google-maps', 'Hôtel X', 'Douala'));
  });

  it('rejette un lead sans nom', () => {
    expect(() => normalizeLead({ source: 's' } as unknown as RawLead)).toThrow();
  });

  it('infère le rôle du décideur depuis l’intitulé', () => {
    expect(inferRole('Directeur Général')).toBe(ContactRole.GeneralManager);
    expect(inferRole('Propriétaire & Fondateur')).toBe(ContactRole.Owner);
    expect(inferRole('Réceptionniste')).toBe(ContactRole.Other);
  });

  it('nettoie un site web sans protocole et un email noyé dans du texte', () => {
    const lead = normalizeLead({
      source: 'x',
      companyName: 'Y',
      city: 'Kribi',
      websiteUrl: 'exemple.cm/contact',
      email: 'Écrivez à Contact@Exemple.CM svp',
    });
    expect(lead.websiteUrl).toBe('https://exemple.cm/contact');
    expect(lead.email).toBe('contact@exemple.cm');
  });
});

describe('LeadPipeline', () => {
  it('valide, dédoublonne et compte', async () => {
    async function* source(): AsyncGenerator<RawLead> {
      yield { source: 'google-maps', companyName: 'Hôtel A', city: 'Douala' };
      yield { source: 'google-maps', companyName: 'HOTEL A', city: 'douala' }; // doublon
      yield { source: 'google-maps', companyName: '', city: 'Douala' }; // invalide
      yield { source: 'google-maps', companyName: 'Hôtel B', city: 'Yaoundé' };
    }
    const pipeline = new LeadPipeline({ defaultCountry: 'CM' }, new Logger({ level: 'silent' }));
    const out = [];
    for await (const lead of pipeline.run(source())) out.push(lead);

    expect(out.map((l) => l.companyName)).toEqual(['Hôtel A', 'Hôtel B']);
    expect(pipeline.stats).toMatchObject({ received: 4, invalid: 1, duplicates: 1, accepted: 2 });
  });
});
