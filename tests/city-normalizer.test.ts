import { describe, it, expect } from 'vitest';
import { normalizeCity, cityKey } from '../src/core/pipeline/city-normalizer.js';

describe('normalizeCity', () => {
  it('canonicalise les variantes connues', () => {
    expect(normalizeCity('DOUALA')).toBe('Douala');
    expect(normalizeCity('dla')).toBe('Douala');
    expect(normalizeCity('  yaounde ')).toBe('Yaoundé');
  });

  it('coupe la région après la virgule', () => {
    expect(normalizeCity('Douala, Littoral')).toBe('Douala');
  });

  it('titlecase les villes inconnues', () => {
    expect(normalizeCity('kaélé')).toBe('Kaélé');
  });

  it('cityKey rapproche accents et casse', () => {
    expect(cityKey('Yaoundé')).toBe(cityKey('yaounde'));
    expect(cityKey('Douala ')).toBe(cityKey('DLA'));
  });
});
