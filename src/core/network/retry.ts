import pRetry, { AbortError } from 'p-retry';

/** HTTP status codes considered temporary (blocked / overloaded). */
export const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  /** Exponential multiplier (default 2). */
  factor?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export interface HttpErrorLike {
  response?: { statusCode?: number };
  code?: string;
}

export function isRetryableError(error: unknown): boolean {
  const e = error as HttpErrorLike;
  const status = e?.response?.statusCode;
  if (typeof status === 'number' && RETRYABLE_STATUS.has(status)) return true;
  const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'];
  return typeof e?.code === 'string' && transientCodes.includes(e.code);
}

/**
 * Runs `fn` with exponential backoff + jitter. Errors judged
 * permanent (4xx outside the list) stop the attempts immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const factor = options.factor ?? 2;
  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (error) {
        if (!isRetryableError(error)) {
          throw new AbortError(error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
      }
    },
    {
      retries: options.retries,
      factor,
      minTimeout: options.baseDelayMs,
      randomize: true,
      onFailedAttempt: (err) => {
        options.onRetry?.(err, err.attemptNumber);
      },
    },
  );
}

export { AbortError };
