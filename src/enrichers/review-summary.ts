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
 * Summarizes a batch of reviews via the Anthropic API (Messages). Throws if no
 * key is available: the caller then falls back to raw excerpts.
 */
export async function summarizeReviews(reviews: RawReview[], options: SummarizeOptions): Promise<ReviewSummary> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('missing ANTHROPIC_API_KEY');
  if (reviews.length === 0) throw new Error('no reviews');

  const corpus = reviews
    .map((r, i) => `[${i + 1}] (${r.ratingLabel || '?'}) ${r.text.replace(/\s+/g, ' ').slice(0, 500)}`)
    .join('\n');

  const prompt =
    `Here are Google Maps customer reviews for "${options.companyName}".\n\n${corpus}\n\n` +
    `Answer ONLY with a valid JSON object, with no surrounding text, in the form:\n` +
    `{"summary": "<2-3 factual sentences in English>", "sentiment": "positive|mixed|negative", ` +
    `"highlights": ["<notable point>", "..."]}\n` +
    `"highlights": 3 to 5 short items (recurring strengths and weaknesses).`;

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
  const match = new RegExp(/\{[\s\S]*}/).exec(text);
  if (!match) throw new Error('unparseable LLM response');
  const parsed = JSON.parse(match[0]) as Partial<ReviewSummary>;

  const sentiment =
    parsed.sentiment === 'positive' || parsed.sentiment === 'negative' || parsed.sentiment === 'mixed'
      ? parsed.sentiment
      : 'mixed';

  return {
    summary: (parsed.summary ?? '').trim(),
    sentiment,
    highlights: Array.isArray(parsed.highlights)
      ? parsed.highlights.filter((h): h is string => true).slice(0, 5)
      : [],
  };
}
