import { describe, it, expect } from 'vitest';
import { normalizePhone, toE164 } from '../src/core/pipeline/phone-normalizer.js';

describe('normalizePhone (Cameroun)', () => {
  it('ajoute l’indicatif à un numéro national à 9 chiffres', () => {
    const n = normalizePhone('6 99 12 34 56', 'CM');
    expect(n.e164).toBe('+237699123456');
    expect(n.valid).toBe(true);
    expect(n.country).toBe('CM');
  });

  it('reconnaît un numéro déjà au format international', () => {
    expect(toE164('+237 233 42 00 01', 'CM')).toBe('+237233420001');
  });

  it('nettoie les séparateurs et le préfixe 00', () => {
    expect(toE164('00 237 6 99 00 00 00', 'CM')).toBe('+237699000000');
  });

  it('prend le premier numéro quand le champ en contient plusieurs', () => {
    const n = normalizePhone('+237 699 00 00 00 / 233 00 00 00', 'CM');
    expect(n.e164).toBe('+237699000000');
  });

  it('renvoie invalide pour une chaîne vide ou du bruit', () => {
    expect(normalizePhone('', 'CM').valid).toBe(false);
    expect(normalizePhone('N/A', 'CM').valid).toBe(false);
  });
});
