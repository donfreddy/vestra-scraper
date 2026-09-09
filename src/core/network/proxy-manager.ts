export interface ProxyConfig {
  /** Protocole + hôte + port, ex: `http://12.34.56.78:8000`. */
  server: string;
  username?: string;
  password?: string;
}

/**
 * Parse une liste de proxies séparés par des virgules.
 * Formats acceptés par entrée :
 *   - `http://user:pass@host:port`
 *   - `http://host:port`
 *   - `host:port` (protocole `http` supposé)
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

/** Construit l'URL complète (avec credentials inline) exploitable par un agent HTTP. */
export function proxyToUrl(proxy: ProxyConfig): string {
  if (!proxy.username && !proxy.password) return proxy.server;
  const url = new URL(proxy.server);
  url.username = encodeURIComponent(proxy.username ?? '');
  if (proxy.password) url.password = encodeURIComponent(proxy.password);
  return url.toString();
}

/**
 * Rotation Round-Robin d'un pool de proxies statiques. Pour un proxy résidentiel
 * rotatif (BrightData, etc.), fournir une seule entrée : la rotation est gérée
 * côté fournisseur.
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

  /** Proxy suivant, ou `undefined` si aucun proxy configuré. */
  next(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;
    const proxy = this.proxies[this.index % this.proxies.length];
    this.index += 1;
    return proxy;
  }

  /** Proxy courant sans avancer le curseur. */
  peek(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;
    return this.proxies[this.index % this.proxies.length];
  }
}
