import type { Page } from 'playwright';
import type { IScraper, ScraperContext, ScraperQuery } from '../../core/types/scraper.interface.js';
import type { RawLead } from '../../core/types/lead.entity.js';
import { BrowserDriver } from '../../core/driver/browser.driver.js';
import { toRawLead, type GmapsPlaceRaw } from './gmaps.parser.js';

export interface GoogleMapsScraperOptions {
  browser: BrowserDriver;
  /** Max pause without a new result while scrolling before stopping (ms). */
  scrollIdleMs?: number;
  /** Max number of scroll cycles (safety guard). */
  maxScrolls?: number;
}

const CONSENT_SELECTORS = [
  'button[aria-label*="Tout accepter"]',
  'button[aria-label*="Accept all"]',
  'form[action*="consent"] button',
  '#L2AGLb',
];

/** Extraction body executed in the page context (string = not transpiled). */
const PLACE_EXTRACTION_JS = `(() => {
  const text = (sel) => { const el = document.querySelector(sel); return (el && el.textContent ? el.textContent.trim() : '') || undefined; };
  const attr = (sel, name) => { const el = document.querySelector(sel); return (el && el.getAttribute(name)) || undefined; };

  const name = text('h1');
  if (!name) return null;

  const phoneButton = document.querySelector('button[data-item-id^="phone:tel:"]');
  const phone = (phoneButton && phoneButton.getAttribute('data-item-id') || '').replace('phone:tel:', '')
    || (phoneButton && phoneButton.textContent ? phoneButton.textContent.trim() : '') || undefined;

  const websiteEl = document.querySelector('a[data-item-id="authority"]');

  const ratingText = text('div.F7nice span[aria-hidden="true"]')
    || (document.querySelector('span[role="img"][aria-label*="étoile"]') || {}).ariaLabel
    || undefined;

  const reviewsText = text('div.F7nice span[aria-label*="avis"]')
    || (document.querySelector('button[aria-label*="avis"]') || {}).ariaLabel
    || undefined;

  const address = ((attr('button[data-item-id="address"]', 'aria-label') || '').replace(/^Adresse:\\s*/i, ''))
    || text('button[data-item-id="address"]') || undefined;

  let category = text('button[jsaction*="category"]') || text('[jsaction*="category"]') || undefined;
  if (category && /^(ajouter|add|suggest|modifier|claim|revendiquer)/i.test(category)) category = undefined;

  return {
    name: name,
    placeUrl: location.href,
    category: category,
    address: address,
    phone: phone,
    website: (websiteEl && websiteEl.href) || undefined,
    ratingText: ratingText,
    reviewsText: reviewsText,
  };
})()`;

/**
 * Google Maps strategy via Playwright.
 *
 * Known limits: Google caps a search at ~120 results per area. To cover a
 * large city exhaustively, run several targeted queries (neighborhoods) and
 * let the pipeline deduplicate.
 */
export class GoogleMapsScraper implements IScraper {
  readonly name = 'google-maps';
  private readonly scrollIdleMs: number;
  private readonly maxScrolls: number;

  constructor(private readonly options: GoogleMapsScraperOptions) {
    this.scrollIdleMs = options.scrollIdleMs ?? 3000;
    this.maxScrolls = options.maxScrolls ?? 60;
  }

  async *execute(query: ScraperQuery, ctx: ScraperContext): AsyncIterable<RawLead> {
    const log = ctx.logger.child(this.name);
    const searchUrl = this.buildSearchUrl(query);
    const fallbackCity = query.location.split(',')[0]?.trim();

    // 1. Collect place URLs (list page + scroll).
    const placeUrls = await this.options.browser.withPage(async (page) => {
      await this.dismissConsent(page);
      log.info(`opening search: ${query.query} @ ${query.location}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await this.dismissConsent(page);

      const detail = await this.tryExtractSinglePlace(page);
      if (detail) {
        // Google redirected directly to a single place.
        return { single: detail, urls: [] as string[] };
      }

      await page.waitForSelector('div[role="feed"]', { timeout: 20_000 }).catch(() => undefined);
      const urls = await this.collectPlaceUrls(page, query.limit || Number.MAX_SAFE_INTEGER, log);
      return { single: null as GmapsPlaceRaw | null, urls };
    });

    if (placeUrls.single) {
      yield toRawLead(placeUrls.single, { fallbackCity, country: query.country });
      return;
    }

    log.info(`${placeUrls.urls.length} places to visit`);

    // 2. Visit each place to extract the details.
    let done = 0;
    for (const url of placeUrls.urls) {
      if (ctx.signal?.aborted) {
        log.warn('interruption requested, stopping collection');
        return;
      }
      if (query.limit && done >= query.limit) return;

      try {
        const place = await this.options.browser.withPage(async (page) => {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await this.dismissConsent(page);
          await page.waitForSelector('h1', { timeout: 15_000 }).catch(() => undefined);
          return this.extractPlaceDetails(page);
        });
        if (place?.name) {
          done += 1;
          yield toRawLead(place, { fallbackCity, country: query.country });
        }
      } catch (error) {
        log.warn(`place extraction failed: ${(error as Error).message}`);
      }
    }
  }

  private buildSearchUrl(query: ScraperQuery): string {
    const term = `${query.query} ${query.location}`.replace(/\s+/g, '+');
    return `https://www.google.com/maps/search/${encodeURIComponent(term).replace(/%2B/g, '+')}?hl=fr`;
  }

  private async dismissConsent(page: Page): Promise<void> {
    for (const selector of CONSENT_SELECTORS) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => undefined);
        await page.waitForLoadState('domcontentloaded').catch(() => undefined);
        return;
      }
    }
  }

  private async collectPlaceUrls(
    page: Page,
    limit: number,
    log: ScraperContext['logger'],
  ): Promise<string[]> {
    const seen = new Set<string>();
    let stableSince = Date.now();
    let scrolls = 0;

    const grab = async (): Promise<number> => {
      const hrefs = await page
        .locator('div[role="feed"] a[href*="/maps/place/"]')
        .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
      let added = 0;
      for (const href of hrefs) {
        if (!seen.has(href)) {
          seen.add(href);
          added += 1;
        }
      }
      return added;
    };

    await grab();
    while (seen.size < limit && scrolls < this.maxScrolls) {
      const added = await grab();
      if (added > 0) {
        stableSince = Date.now();
        log.debug(`+${added} places (total ${seen.size})`);
      } else if (Date.now() - stableSince > this.scrollIdleMs) {
        break;
      }
      await page.locator('div[role="feed"]').evaluate((el) => el.scrollBy(0, el.scrollHeight));
      await page.waitForTimeout(1200);
      scrolls += 1;
    }

    return [...seen].slice(0, Number.isFinite(limit) ? limit : undefined);
  }

  /**
   * Extraction from the side panel of an opened place.
   * Passed as a string to `page.evaluate`: prevents the transpiler
   * (esbuild/tsx) from injecting helpers (`__name`) that are undefined in the
   * page context.
   */
  private async extractPlaceDetails(page: Page): Promise<GmapsPlaceRaw | null> {
    const result = await page.evaluate(PLACE_EXTRACTION_JS);
    return (result as GmapsPlaceRaw | null) ?? null;
  }

  /** Case where the search directly opens a single place. */
  private async tryExtractSinglePlace(page: Page): Promise<GmapsPlaceRaw | null> {
    if (!/\/maps\/place\//.test(page.url())) return null;
    await page.waitForSelector('h1', { timeout: 10_000 }).catch(() => undefined);
    return this.extractPlaceDetails(page);
  }
}
