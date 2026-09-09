import { describe, it, expect } from 'vitest';
import {
  extractEmails,
  extractPhones,
  extractSocials,
  extractLegalName,
  extractContacts,
} from '../src/enrichers/extract.js';

describe('extractEmails', () => {
  it('récupère les e-mails et écarte les faux positifs', () => {
    const html = `
      <a href="mailto:Contact@Hotel-X.CM">nous écrire</a>
      texte reservation@hotel-x.cm et logo@2x.png sprite@sentry.io
    `;
    expect(extractEmails(html).sort()).toEqual(['contact@hotel-x.cm', 'reservation@hotel-x.cm']);
  });
});

describe('extractPhones', () => {
  it('normalise en E.164 et dédoublonne', () => {
    expect(extractPhones(['+237 699 00 00 00', 'Tel: 6 99 00 00 00 / 233 42 00 01'], 'CM')).toEqual([
      '+237699000000',
      '+237233420001',
    ]);
  });
});

describe('extractSocials', () => {
  it('classe les liens par réseau', () => {
    const s = extractSocials([
      'https://www.facebook.com/hotelx',
      'https://www.facebook.com/sharer/sharer.php?u=x',
      'https://www.linkedin.com/company/hotel-x/',
      'https://wa.me/237699000000',
      'https://example.cm',
    ]);
    expect(s.facebook).toBe('https://www.facebook.com/hotelx');
    expect(s.linkedin).toBe('https://www.linkedin.com/company/hotel-x');
    expect(s.whatsapp).toBe('+237699000000');
  });
});

describe('extractLegalName', () => {
  it('reconnaît une forme juridique', () => {
    expect(extractLegalName('© 2024 AKWA PALACE SARL — tous droits réservés')).toBe('AKWA PALACE SARL');
    expect(extractLegalName('Hôtel sympa sans mention légale')).toBeUndefined();
  });
});

describe('extractContacts', () => {
  it('repère les couples nom / titre', () => {
    const contacts = extractContacts('Notre équipe : Jean-Pierre Mbarga, Directeur Général. Awa Ntsama — Responsable Réservations');
    const gm = contacts.find((c) => c.fullName === 'Jean-Pierre Mbarga');
    expect(gm?.role).toBe('GENERAL_MANAGER');
    expect(contacts.map((c) => c.fullName)).toContain('Awa Ntsama');
  });
});
