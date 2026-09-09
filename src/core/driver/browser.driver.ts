import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ProxyManager, type ProxyConfig } from '../network/proxy-manager.js';
import { RateLimiter } from '../network/rate-limiter.js';
import type { Logger } from '../logger.js';

export interface BrowserDriverOptions {
  headless?: boolean;
  locale?: string;
  timezone?: string;
  proxies?: ProxyConfig[];
  /** Pages opened simultaneously. */
  concurrency?: number;
  /** Rate of `withPage` navigations. */
  navigationRate?: { maxRequests: number; intervalMs: number };
  navigationTimeoutMs?: number;
  logger: Logger;
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Headless-browser abstraction. One instance = one Chromium `Browser`,
 * reused across navigations. `withPage` serializes/limits page openings
 * and applies the current proxy.
 */
export class BrowserDriver {
  private browser: Browser | undefined;
  private readonly proxyManager: ProxyManager;
  private readonly rateLimiter: RateLimiter;
  private readonly opts: Required<Omit<BrowserDriverOptions, 'proxies' | 'logger' | 'navigationRate'>>;
  private readonly log: Logger;

  constructor(private readonly options: BrowserDriverOptions) {
    this.log = options.logger.child('browser');
    this.proxyManager = new ProxyManager(options.proxies ?? []);
    this.rateLimiter = new RateLimiter({
      maxRequests: options.navigationRate?.maxRequests ?? 3,
      intervalMs: options.navigationRate?.intervalMs ?? 1000,
      concurrency: options.concurrency ?? 1,
    });
    this.opts = {
      headless: options.headless ?? true,
      locale: options.locale ?? 'fr-FR',
      timezone: options.timezone ?? 'Africa/Douala',
      concurrency: options.concurrency ?? 1,
      navigationTimeoutMs: options.navigationTimeoutMs ?? 45_000,
    };
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    this.log.debug(`launching Chromium (headless=${this.opts.headless})`);
    this.browser = await chromium.launch({
      headless: this.opts.headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
    return this.browser;
  }

  private async newContext(): Promise<BrowserContext> {
    const browser = await this.ensureBrowser();
    const proxy = this.proxyManager.next();
    const context = await browser.newContext({
      userAgent: UA,
      locale: this.opts.locale,
      timezoneId: this.opts.timezone,
      viewport: { width: 1366, height: 900 },
      ...(proxy
        ? {
            proxy: {
              server: proxy.server,
              ...(proxy.username ? { username: proxy.username } : {}),
              ...(proxy.password ? { password: proxy.password } : {}),
            },
          }
        : {}),
    });
    context.setDefaultNavigationTimeout(this.opts.navigationTimeoutMs);
    context.setDefaultTimeout(this.opts.navigationTimeoutMs);
    // Hide `navigator.webdriver`.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    return context;
  }

  /**
   * Opens an isolated context + page, runs `fn`, then cleans up.
   * Respects the concurrency limit and the navigation rate.
   */
  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    return this.rateLimiter.schedule(async () => {
      const context = await this.newContext();
      const page = await context.newPage();
      try {
        return await fn(page);
      } finally {
        await context.close().catch(() => undefined);
      }
    });
  }

  async close(): Promise<void> {
    await this.rateLimiter.onIdle();
    await this.browser?.close().catch(() => undefined);
    this.browser = undefined;
  }
}
