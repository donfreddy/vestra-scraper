import PQueue from 'p-queue';

export interface RateLimiterOptions {
  /** Max number of tasks started per window. */
  maxRequests: number;
  /** Length of the sliding window, in milliseconds. */
  intervalMs: number;
  /** Maximum simultaneous concurrency (default: `maxRequests`). */
  concurrency?: number;
}

/**
 * Sliding-window rate limiter built on `p-queue`.
 * Guarantees at most `maxRequests` starts per `intervalMs`.
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

  /** Runs `fn` while respecting the rate budget. */
  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(fn, { throwOnTimeout: true }) as Promise<T>;
  }

  /** Waits for all queued tasks to finish. */
  onIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  get pending(): number {
    return this.queue.pending + this.queue.size;
  }
}
