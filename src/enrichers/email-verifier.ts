import { promises as dns } from 'node:dns';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import type { VestraLead, EmailStatus } from '../core/types/lead.entity.js';
import type { EnrichContext, IEnricher, LeadPatch } from '../core/types/enricher.interface.js';

const DISPOSABLE = new Set([
  'mailinator.com',
  'yopmail.com',
  'guerrillamail.com',
  'trashmail.com',
  '10minutemail.com',
  'tempmail.com',
]);

export interface EmailVerifierOptions {
  /** SMTP probe (RCPT TO). Disable if outbound port 25 is blocked. */
  smtpProbe?: boolean;
  /** Address used as `MAIL FROM`. */
  fromAddress?: string;
  timeoutMs?: number;
}

interface DomainCheck {
  hasMx: boolean;
  mxHost?: string;
  catchAll?: boolean;
}

/**
 * Validates emails: syntax -> disposable domain -> MX records ->
 * (optional) SMTP `RCPT TO` handshake + catch-all detection.
 * Degrades to `unknown` if the network blocks the SMTP probe.
 */
export class EmailVerifier implements IEnricher {
  readonly name = 'email';
  private readonly smtpProbe: boolean;
  private readonly from: string;
  private readonly timeout: number;
  private readonly domainCache = new Map<string, Promise<DomainCheck>>();

  constructor(options: EmailVerifierOptions = {}) {
    this.smtpProbe = options.smtpProbe ?? true;
    this.from = options.fromAddress ?? 'verify@example.com';
    this.timeout = options.timeoutMs ?? 8000;
  }

  supports(lead: VestraLead): boolean {
    return Boolean(lead.email || lead.emails.length || lead.contacts.some((c) => c.emailDirect));
  }

  async enrich(lead: VestraLead, ctx: EnrichContext): Promise<LeadPatch> {
    const log = ctx.logger.child(this.name);
    const targets = new Set<string>(
      [lead.email, ...lead.emails, ...lead.contacts.map((c) => c.emailDirect)].filter(
        (e): e is string => Boolean(e),
      ),
    );
    if (targets.size === 0) return {};

    const results = new Map<string, EmailStatus>();
    let catchAll: boolean | undefined;
    for (const email of targets) {
      const { status, domainCatchAll } = await this.verify(email).catch(() => ({
        status: 'unknown' as EmailStatus,
        domainCatchAll: undefined,
      }));
      results.set(email, status);
      if (domainCatchAll !== undefined) catchAll = domainCatchAll;
    }

    const primary = lead.email && results.get(lead.email);
    const best =
      primary ??
      (['valid', 'risky', 'unknown', 'invalid'] as EmailStatus[]).find((s) =>
        [...results.values()].includes(s),
      );

    const contacts = lead.contacts.map((c) =>
      c.emailDirect && results.get(c.emailDirect) === 'invalid'
        ? { ...c, confidence: Math.min(c.confidence, 0.3) }
        : c,
    );

    log.debug(`${lead.companyName}: ${[...results.entries()].map(([e, s]) => `${e}=${s}`).join(', ')}`);

    const patch: LeadPatch = { contacts };
    if (best) patch.emailStatus = best;
    if (catchAll !== undefined) patch.emailCatchAll = catchAll;
    patch.metadata = { emailChecks: Object.fromEntries(results) };
    return patch;
  }

  private async verify(email: string): Promise<{ status: EmailStatus; domainCatchAll?: boolean }> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || !/^[a-z0-9.\-]+\.[a-z]{2,}$/.test(domain)) return { status: 'invalid' };
    if (DISPOSABLE.has(domain)) return { status: 'invalid' };

    const check = await this.checkDomain(domain);
    if (!check.hasMx) return { status: 'invalid' };
    if (!this.smtpProbe || !check.mxHost) return { status: 'unknown' };

    if (check.catchAll) return { status: 'risky', domainCatchAll: true };

    const accepted = await this.smtpRcpt(check.mxHost, email).catch(() => null);
    if (accepted === null) return { status: 'unknown', domainCatchAll: check.catchAll };
    return { status: accepted ? 'valid' : 'invalid', domainCatchAll: check.catchAll };
  }

  private checkDomain(domain: string): Promise<DomainCheck> {
    let cached = this.domainCache.get(domain);
    if (!cached) {
      cached = this.resolveDomain(domain);
      this.domainCache.set(domain, cached);
    }
    return cached;
  }

  private async resolveDomain(domain: string): Promise<DomainCheck> {
    const mx = await dns.resolveMx(domain).catch(() => [] as { exchange: string; priority: number }[]);
    if (mx.length === 0) return { hasMx: false };
    const mxHost = [...mx].sort((a, b) => a.priority - b.priority)[0]!.exchange;
    if (!this.smtpProbe) return { hasMx: true, mxHost };
    const probe = `${randomBytes(12).toString('hex')}@${domain}`;
    const accepted = await this.smtpRcpt(mxHost, probe).catch(() => undefined as boolean | undefined);
    if (accepted === undefined) return { hasMx: true, mxHost };
    return { hasMx: true, mxHost, catchAll: accepted };
  }

  /** Opens a minimal SMTP session and returns the `RCPT TO` acceptance. */
  private smtpRcpt(mxHost: string, rcpt: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(25, mxHost);
      let stage = 0;
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        fn();
      };

      socket.setTimeout(this.timeout);
      socket.on('timeout', () => finish(() => reject(new Error('smtp timeout'))));
      socket.on('error', (err) => finish(() => reject(err)));

      socket.on('data', (buf) => {
        const line = buf.toString();
        const code = Number.parseInt(line.slice(0, 3), 10);
        if (stage === 0) {
          if (code !== 220) return finish(() => reject(new Error(`greeting ${code}`)));
          socket.write(`EHLO example.com\r\n`);
          stage = 1;
        } else if (stage === 1) {
          socket.write(`MAIL FROM:<${this.from}>\r\n`);
          stage = 2;
        } else if (stage === 2) {
          if (code >= 400) return finish(() => reject(new Error(`MAIL FROM ${code}`)));
          socket.write(`RCPT TO:<${rcpt}>\r\n`);
          stage = 3;
        } else if (stage === 3) {
          socket.write(`QUIT\r\n`);
          finish(() => resolve(code >= 200 && code < 300));
        }
      });
    });
  }
}
