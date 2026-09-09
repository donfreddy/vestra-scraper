import { describe, it, expect } from 'vitest';
import { normalizeCity, cityKey } from '../src/core/pipeline/city-normalizer.js';

describe('normalizeCity', () => {
  it('canonicalizes known variants', () => {
    expect(normalizeCity('DOUALA')).toBe('Douala');
    expect(normalizeCity('dla')).toBe('Douala');
    expect(normalizeCity('  yaounde ')).toBe('Yaoundé');
  });

  it('cuts the region after the comma', () => {
    expect(normalizeCity('Douala, Littoral')).toBe('Douala');
  });

  it('titlecases unknown cities', () => {
    expect(normalizeCity('kaélé')).toBe('Kaélé');
  });

  it('cityKey matches accents and case', () => {
    expect(cityKey('Yaoundé')).toBe(cityKey('yaounde'));
    expect(cityKey('Douala ')).toBe(cityKey('DLA'));
  });
});
