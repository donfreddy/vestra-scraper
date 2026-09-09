export interface ProxyConfig {
  /** Protocol + host + port, e.g. `http://12.34.56.78:8000`. */
  server: string;
  username?: string;
  password?: string;
}

/**
 * Parses a comma-separated list of proxies.
 * Accepted formats per entry:
 *   - `http://user:pass@host:port`
 *   - `http://host:port`
 *   - `host:port` (`http` protocol assumed)
 */
export function parseProxyList(raw: string): ProxyConfig[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseProxyEntry);
}

export function parseProxyEntry(entry: string): ProxyConfig {
  const withProto = /:\/\//.test(entry) ? entry : `http://${entry}`;
  const url = new URL(withProto);
  const config: ProxyConfig = {
    server: `${url.protocol}//${url.host}`,
  };
  if (url.username) config.username = decodeURIComponent(url.username);
  if (url.password) config.password = decodeURIComponent(url.password);
  return config;
}

/** Builds the full URL (with inline credentials) usable by an HTTP agent. */
export function proxyToUrl(proxy: ProxyConfig): string {
  if (!proxy.username && !proxy.password) return proxy.server;
  const url = new URL(proxy.server);
  url.username = encodeURIComponent(proxy.username ?? '');
  if (proxy.password) url.password = encodeURIComponent(proxy.password);
  return url.toString();
}

/**
 * Round-Robin rotation over a pool of static proxies. For a rotating
 * residential proxy (BrightData, etc.), provide a single entry: rotation is
 * handled by the provider.
 */
export class ProxyManager {
  private index = 0;

  constructor(private readonly proxies: ProxyConfig[] = []) {}

  get size(): number {
    return this.proxies.length;
  }

  get enabled(): boolean {
    return this.proxies.length > 0;
  }

  /** Next proxy, or `undefined` if no proxy is configured. */
  next(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;
    const proxy = this.proxies[this.index % this.proxies.length];
    this.index += 1;
    return proxy;
  }

  /** Current proxy without advancing the cursor. */
  peek(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;
    return this.proxies[this.index % this.proxies.length];
  }
}
