import { describe, it, expect } from 'vitest';
import { parseSummary } from '../src/enrichers/review-summary.js';

describe('parseSummary', () => {
  it('extrait le JSON même entouré de texte', () => {
    const out = parseSummary(
      'Voici le résultat :\n{"summary": "Bon accueil, chambres propres.", "sentiment": "positive", "highlights": ["personnel aimable", "wifi lent"]}\nMerci.',
    );
    expect(out.sentiment).toBe('positive');
    expect(out.summary).toContain('accueil');
    expect(out.highlights).toHaveLength(2);
  });

  it('retombe sur "mixed" si le sentiment est absent/invalide', () => {
    expect(parseSummary('{"summary": "x", "highlights": []}').sentiment).toBe('mixed');
  });

  it('lève si aucun JSON', () => {
    expect(() => parseSummary('pas de json ici')).toThrow();
  });
});
