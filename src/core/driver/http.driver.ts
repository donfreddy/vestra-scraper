import got, { type Got, type OptionsOfTextResponseBody } from 'got';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import * as cheerio from 'cheerio';
import { ProxyManager, proxyToUrl, type ProxyConfig } from '../network/proxy-manager.js';
import { RateLimiter } from '../network/rate-limiter.js';
import { withRetry } from '../network/retry.js';
import type { Logger } from '../logger.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export interface HttpDriverOptions {
  proxies?: ProxyConfig[];
  rateLimit?: { maxRequests: number; intervalMs: number };
  retry?: { retries: number; baseDelayMs: number };
  timeoutMs?: number;
  userAgent?: string;
  logger: Logger;
}

/**
 * HTTP transport layer. Encapsulates rate-limiting, proxy rotation and
 * exponential retry: scrapers call `getText` / `getJson` / `getDom` without
 * worrying about these network constraints.
 */
export class HttpDriver {
  private readonly proxyManager: ProxyManager;
  private readonly rateLimiter: RateLimiter;
  private readonly retryOpts: { retries: number; baseDelayMs: number };
  private readonly client: Got;
  private readonly log: Logger;

  constructor(options: HttpDriverOptions) {
    this.log = options.logger.child('http');
    this.proxyManager = new ProxyManager(options.proxies ?? []);
    this.rateLimiter = new RateLimiter({
      maxRequests: options.rateLimit?.maxRequests ?? 5,
      intervalMs: options.rateLimit?.intervalMs ?? 1000,
    });
    this.retryOpts = {
      retries: options.retry?.retries ?? 3,
      baseDelayMs: options.retry?.baseDelayMs ?? 1500,
    };
    this.client = got.extend({
      timeout: { request: options.timeoutMs ?? 15_000 },
      retry: { limit: 0 }, // retry is handled by `withRetry`
      headers: {
        'user-agent': options.userAgent ?? DEFAULT_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      followRedirect: true,
    });
  }

  private agentFor(proxy: ProxyConfig | undefined): OptionsOfTextResponseBody['agent'] {
    if (!proxy) return undefined;
    const proxyUrl = proxyToUrl(proxy);
    return {
      http: new HttpProxyAgent({ proxy: proxyUrl }),
      https: new HttpsProxyAgent({ proxy: proxyUrl }),
    };
  }

  private async request(url: string, options: OptionsOfTextResponseBody = {}): Promise<string> {
    return this.rateLimiter.schedule(() =>
      withRetry(
        async () => {
          const proxy = this.proxyManager.next();
          const res = await this.client(url, {
            ...options,
            agent: this.agentFor(proxy),
          });
          return res.body;
        },
        {
          ...this.retryOpts,
          onRetry: (err, attempt) => {
            const status = (err as { response?: { statusCode?: number } }).response?.statusCode;
            this.log.warn(
              `blocked/error (${status ?? (err as { code?: string }).code ?? 'unknown'}) on ${url}, attempt ${attempt}/${this.retryOpts.retries}`,
            );
          },
        },
      ),
    );
  }

  getText(url: string, options?: OptionsOfTextResponseBody): Promise<string> {
    return this.request(url, options);
  }

  async getJson<T = unknown>(url: string, options?: OptionsOfTextResponseBody): Promise<T> {
    const body = await this.request(url, {
      ...options,
      headers: { accept: 'application/json,text/plain,*/*', ...(options?.headers ?? {}) },
    });
    return JSON.parse(body) as T;
  }

  async getDom(url: string, options?: OptionsOfTextResponseBody): Promise<cheerio.CheerioAPI> {
    const html = await this.request(url, options);
    return cheerio.load(html);
  }

  get proxyCount(): number {
    return this.proxyManager.size;
  }
}
