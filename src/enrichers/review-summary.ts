export interface RawReview {
  author: string;
  ratingLabel: string;
  text: string;
}

export interface ReviewSummary {
  summary: string;
  sentiment: 'positive' | 'mixed' | 'negative';
  highlights: string[];
}

export interface SummarizeOptions {
  companyName: string;
  apiKey?: string | undefined;
  signal?: AbortSignal | undefined;
  model?: string;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Résume un lot d'avis via l'API Anthropic (Messages). Lève si aucune clé n'est
 * disponible : l'appelant retombe alors sur des extraits bruts.
 */
export async function summarizeReviews(reviews: RawReview[], options: SummarizeOptions): Promise<ReviewSummary> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY absente');
  if (reviews.length === 0) throw new Error('aucun avis');

  const corpus = reviews
    .map((r, i) => `[${i + 1}] (${r.ratingLabel || '?'}) ${r.text.replace(/\s+/g, ' ').slice(0, 500)}`)
    .join('\n');

  const prompt =
    `Voici des avis clients Google Maps concernant "${options.companyName}".\n\n${corpus}\n\n` +
    `Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :\n` +
    `{"summary": "<2-3 phrases en français, factuel>", "sentiment": "positive|mixed|negative", ` +
    `"highlights": ["<point saillant>", "..."]}\n` +
    `"highlights" : 3 à 5 éléments courts (points forts et points faibles récurrents).`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: options.signal ?? null,
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.map((c) => c.text ?? '').join('') ?? '';
  return parseSummary(text);
}

export function parseSummary(text: string): ReviewSummary {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('réponse LLM non parsable');
  const parsed = JSON.parse(match[0]) as Partial<ReviewSummary>;

  const sentiment =
    parsed.sentiment === 'positive' || parsed.sentiment === 'negative' || parsed.sentiment === 'mixed'
      ? parsed.sentiment
      : 'mixed';

  return {
    summary: (parsed.summary ?? '').trim(),
    sentiment,
    highlights: Array.isArray(parsed.highlights)
      ? parsed.highlights.filter((h): h is string => typeof h === 'string').slice(0, 5)
      : [],
  };
}
