import PQueue from 'p-queue';

export interface RateLimiterOptions {
  /** Nombre max de tâches démarrées par fenêtre. */
  maxRequests: number;
  /** Durée de la fenêtre glissante, en millisecondes. */
  intervalMs: number;
  /** Concurrence maximale simultanée (défaut : `maxRequests`). */
  concurrency?: number;
}

/**
 * Limiteur de débit à fenêtre glissante basé sur `p-queue`.
 * Garantit au plus `maxRequests` démarrages par `intervalMs`.
 */
export class RateLimiter {
  private readonly queue: PQueue;

  constructor(options: RateLimiterOptions) {
    this.queue = new PQueue({
      concurrency: options.concurrency ?? options.maxRequests,
      intervalCap: options.maxRequests,
      interval: options.intervalMs,
      carryoverConcurrencyCount: true,
    });
  }

  /** Exécute `fn` en respectant le budget de débit. */
  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(fn, { throwOnTimeout: true }) as Promise<T>;
  }

  /** Attend la fin de toutes les tâches en file. */
  onIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  get pending(): number {
    return this.queue.pending + this.queue.size;
  }
}
