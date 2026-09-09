import type { Page } from 'playwright';
import type { B2BLead, ReviewsInsight } from '../core/types/lead.entity.js';
import type { EnrichContext, IEnricher, LeadPatch } from '../core/types/enricher.interface.js';
import { summarizeReviews, type RawReview } from './review-summary.js';

const REVIEWS_EXTRACTION_JS = `(() => {
  const nodes = Array.from(document.querySelectorAll('div[data-review-id]'));
  return nodes.slice(0, 40).map((n) => {
    const author = (n.querySelector('div.d4r55, .WNxzHc') || {}).textContent || '';
    const ratingEl = n.querySelector('span[role="img"][aria-label*="étoile"], span.kvMYJc');
    const ratingLabel = ratingEl ? (ratingEl.getAttribute('aria-label') || '') : '';
    const more = n.querySelector('button[aria-label="Voir plus"], button.w8nwRe');
    if (more) { try { more.click(); } catch (e) {} }
    const textEl = n.querySelector('.wiI7pd, .MyEned, span.review-full-text');
    return {
      author: author.trim(),
      ratingLabel: ratingLabel.trim(),
      text: textEl ? (textEl.textContent || '').trim() : '',
    };
  }).filter((r) => r.text.length > 0);
})()`;

export interface ReviewsEnricherOptions {
  /** Max number of reviews fetched (default 25). */
  maxReviews?: number;
}

/**
 * Fetches the Google Maps reviews of a place and derives a summary + sentiment.
 * Requires a `BrowserDriver` (Playwright) and a Google Maps `sourceUrl`.
 * The LLM summary is produced when `anthropicApiKey` is provided, otherwise
 * the most telling excerpts are returned.
 */
export class ReviewsEnricher implements IEnricher {
  readonly name = 'reviews';
  private readonly maxReviews: number;

  constructor(options: ReviewsEnricherOptions = {}) {
    this.maxReviews = options.maxReviews ?? 25;
  }

  supports(lead: B2BLead): boolean {
    return Boolean(lead.sourceUrl && /google\.[a-z.]+\/maps\/place\//.test(lead.sourceUrl));
  }

  async enrich(lead: B2BLead, ctx: EnrichContext): Promise<LeadPatch> {
    if (!ctx.browser) {
      ctx.logger.child(this.name).warn('BrowserDriver required: enricher ignored');
      return {};
    }
    const log = ctx.logger.child(this.name);

    const raw = await ctx.browser.withPage(async (page) => this.scrape(page, lead.sourceUrl!));
    if (raw.length === 0) return {};

    const ratings = raw
      .map((r) => parseRatingLabel(r.ratingLabel))
      .filter((n): n is number => n !== undefined);
    const average =
      ratings.length > 0 ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : undefined;

    const insight: ReviewsInsight = {
      count: lead.reviewsCount ?? raw.length,
      average: lead.googleRating ?? average,
      highlights: [],
    };

    try {
      const summarized = await summarizeReviews(raw, {
        companyName: lead.companyName,
        apiKey: ctx.anthropicApiKey,
        signal: ctx.signal,
      });
      insight.summary = summarized.summary;
      insight.sentiment = summarized.sentiment;
      insight.highlights = summarized.highlights;
    } catch (error) {
      log.warn(`summary unavailable: ${(error as Error).message}`);
      insight.highlights = raw
        .filter((r) => r.text.length > 40)
        .slice(0, 3)
        .map((r) => truncate(r.text, 200));
    }

    log.debug(`${lead.companyName}: ${raw.length} reviews analyzed (${insight.sentiment ?? 'n/a'})`);
    return { reviews: insight };
  }

  private async scrape(page: Page, placeUrl: string): Promise<RawReview[]> {
    await page.goto(placeUrl, { waitUntil: 'domcontentloaded' });
    for (const sel of ['#L2AGLb', 'button[aria-label*="Tout accepter"]']) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => undefined);
    }

    const reviewsTab = page
      .locator('button[role="tab"][aria-label*="avis"], button[aria-label*="Avis sur"]')
      .first();
    if (await reviewsTab.isVisible().catch(() => false)) {
      await reviewsTab.click().catch(() => undefined);
      await page.waitForTimeout(1500);
    }

    const scroller = page.locator('div[tabindex="-1"] div.m6QErb, div.dS8AEf').last();
    for (let i = 0; i < 6; i += 1) {
      const count = await page.locator('div[data-review-id]').count();
      if (count >= this.maxReviews) break;
      await scroller.evaluate((el) => el.scrollBy(0, 2000)).catch(() => undefined);
      await page.waitForTimeout(1200);
    }

    const raw = (await page.evaluate(REVIEWS_EXTRACTION_JS)) as RawReview[];
    return raw.slice(0, this.maxReviews);
  }
}

function parseRatingLabel(label: string): number | undefined {
  const m = label.replace(',', '.').match(/(\d+(\.\d+)?)\s*(étoile|star)/i) ?? label.match(/(\d+(\.\d+)?)/);
  if (!m) return undefined;
  const v = Number.parseFloat(m[1]!);
  return v >= 0 && v <= 5 ? v : undefined;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
