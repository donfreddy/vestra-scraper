import { describe, it, expect } from 'vitest';
import { parseSummary } from '../src/enrichers/review-summary.js';

describe('parseSummary', () => {
  it('extracts the JSON even surrounded by text', () => {
    const out = parseSummary(
      'Here is the result:\n{"summary": "Friendly welcome, clean rooms.", "sentiment": "positive", "highlights": ["friendly staff", "slow wifi"]}\nThanks.',
    );
    expect(out.sentiment).toBe('positive');
    expect(out.summary).toContain('Friendly');
    expect(out.highlights).toHaveLength(2);
  });

  it('falls back to "mixed" when the sentiment is absent/invalid', () => {
    expect(parseSummary('{"summary": "x", "highlights": []}').sentiment).toBe('mixed');
  });

  it('throws when there is no JSON', () => {
    expect(() => parseSummary('no json here')).toThrow();
  });
});
