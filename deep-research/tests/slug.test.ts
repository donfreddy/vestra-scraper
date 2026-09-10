import { describe, it, expect } from 'vitest';
import { canonicalName, hotelSlug, nameSimilarity, isSameHotel } from '../src/slug.js';

describe('canonicalName / hotelSlug', () => {
  it('produces the same slug across formatting variants', () => {
    const a = hotelSlug('Hôtel La Falaise (Bonapriso)', 'Douala');
    const b = hotelSlug('HOTEL LA FALAISE - BONAPRISO', 'Douala');
    const c = hotelSlug('la falaise bonapriso', 'Douala');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe('douala-falaisebonapriso');
  });

  it('separates by city', () => {
    expect(hotelSlug('La Falaise', 'Douala')).not.toBe(hotelSlug('La Falaise', 'Yaoundé'));
  });

  it('canonicalName strips accents, case and hotel stopwords', () => {
    expect(canonicalName('Hôtel Le Nsimeyong')).toBe('nsimeyong');
    expect(canonicalName('Résidence Akwa')).toBe('akwa');
  });
});

describe('nameSimilarity / isSameHotel', () => {
  it('matches near-identical names', () => {
    expect(isSameHotel('Krystal Palace Douala', 'Krystal Palace')).toBe(true);
    expect(isSameHotel('Hôtel La Falaise Bonapriso', 'La Falaise Douala (Bonapriso)')).toBe(true);
  });

  it('separates genuinely different hotels', () => {
    expect(isSameHotel('Akwa Palace', 'Mont Fébé')).toBe(false);
    expect(nameSimilarity('Hôtel de la Paix 1', 'Hôtel de la Paix 2')).toBeGreaterThan(0.8);
  });
});
