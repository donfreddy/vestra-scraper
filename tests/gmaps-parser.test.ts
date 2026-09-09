import { describe, it, expect } from 'vitest';
import {
  parseRating,
  parseReviews,
  extractCityFromAddress,
  parseLatLngFromUrl,
  toRawLead,
} from '../src/scrapers/google-maps/gmaps.parser.js';

describe('gmaps.parser', () => {
  it('parseRating handles the decimal comma', () => {
    expect(parseRating('4,3')).toBe(4.3);
    expect(parseRating('4.0 stars')).toBe(4);
    expect(parseRating('sans note')).toBeUndefined();
  });

  it('parseReviews extracts the digits', () => {
    expect(parseReviews('(1 234)')).toBe(1234);
    expect(parseReviews('1,234 avis')).toBe(1234);
    expect(parseReviews('')).toBeUndefined();
  });

  it('extractCityFromAddress ignores the country and postal code', () => {
    expect(extractCityFromAddress('123 Rue de la Joie, Akwa, Douala, Cameroun')).toBe('Douala');
    expect(extractCityFromAddress('BP 1234, Yaoundé, Cameroun')).toBe('Yaoundé');
  });

  it('parseLatLngFromUrl reads the coordinates', () => {
    const { latitude, longitude } = parseLatLngFromUrl(
      'https://www.google.com/maps/place/Hotel/@4.0511,9.7679,17z/data=!3d4.0511!4d9.7679',
    );
    expect(latitude).toBeCloseTo(4.0511);
    expect(longitude).toBeCloseTo(9.7679);
  });

  it('toRawLead builds a google-maps RawLead', () => {
    const raw = toRawLead(
      {
        name: '  Hôtel Test  ',
        placeUrl: 'https://www.google.com/maps/place/x/@4.05,9.76,17z',
        category: 'Hôtel',
        address: 'Bonapriso, Douala, Cameroun',
        phone: '+237 6 99 00 00 00',
        website: 'https://hoteltest.cm',
        ratingText: '4,2',
        reviewsText: '(87)',
      },
      { fallbackCity: 'Douala', country: 'CM' },
    );
    expect(raw.companyName).toBe('Hôtel Test');
    expect(raw.source).toBe('google-maps');
    expect(raw.city).toBe('Douala');
    expect(raw.googleRating).toBe(4.2);
    expect(raw.reviewsCount).toBe(87);
    expect(raw.latitude).toBeCloseTo(4.05);
  });
});
