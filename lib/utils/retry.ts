/**
 * Retry utility with exponential backoff
 * Implements resilient error handling for transient failures
 */

import { logger } from './logger';

export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelayMs?: number;

  /**
   * Maximum delay in milliseconds between retries
   * @default 30000 (30 seconds)
   */
  maxDelayMs?: number;

  /**
   * Multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Function to determine if an error should be retried
   * @default retries all errors
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;

  /**
   * Callback invoked before each retry
   */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class MaxRetriesExceededError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: unknown,
  ) {
    super(message);
    this.name = 'MaxRetriesExceededError';
  }
}

const defaultOptions: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  shouldRetry: () => true,
};

/**
 * Executes a function with exponential backoff retry logic
 *
 * @example
 * ```ts
 * const result = await retryWithBackoff(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new RetryableError('API request failed');
 *     return response.json();
 *   },
 *   {
 *     maxAttempts: 5,
 *     initialDelayMs: 500,
 *     shouldRetry: (error) => error instanceof RetryableError,
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!opts.shouldRetry(error, attempt)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const exponentialDelay = opts.initialDelayMs * opts.backoffMultiplier ** (attempt - 1);
      const delayMs = Math.min(exponentialDelay, opts.maxDelayMs);

      // Add jitter to prevent thundering herd
      const jitteredDelay = delayMs * (0.5 + Math.random() * 0.5);

      logger.warn(
        `Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${Math.round(jitteredDelay)}ms`,
        { error: error instanceof Error ? error.message : String(error) },
      );

      // Call onRetry callback if provided
      options.onRetry?.(error, attempt, jitteredDelay);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }

  // All retries exhausted
  throw new MaxRetriesExceededError(
    `Failed after ${opts.maxAttempts} attempts`,
    opts.maxAttempts,
    lastError,
  );
}

/**
 * Determines if an error is retryable based on common patterns
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) {
    return true;
  }

  // Network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('etimedout')
    ) {
      return true;
    }
  }

  // HTTP status codes (if error has status property)
  const errorObj = error as Record<string, unknown>;
  const statusCode =
    (typeof errorObj?.['status'] === 'number' ? errorObj['status'] : undefined) ||
    (typeof errorObj?.['statusCode'] === 'number' ? errorObj['statusCode'] : undefined);
  if (statusCode) {
    // Retry on 5xx server errors and specific 4xx errors
    return (
      statusCode >= 500 ||
      statusCode === 408 || // Request Timeout
      statusCode === 429 || // Too Many Requests
      statusCode === 502 || // Bad Gateway
      statusCode === 503 || // Service Unavailable
      statusCode === 504 // Gateway Timeout
    );
  }

  return false;
}

/**
 * Retry with backoff for RPC calls (common in blockchain interactions)
 * Optionally uses circuit breaker to prevent cascading failures
 */
export async function retryRpcCall<T>(
  fn: () => Promise<T>,
  operationName: string,
  options: { useCircuitBreaker?: boolean } = {},
): Promise<T> {
  const execute = () =>
    retryWithBackoff(fn, {
      maxAttempts: 5,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      shouldRetry: isRetryableError,
      onRetry: (error, attempt, delayMs) => {
        logger.info(`Retrying ${operationName} (attempt ${attempt})`, {
          error: error instanceof Error ? error.message : String(error),
          delayMs: Math.round(delayMs),
        });
      },
    });

  // Use circuit breaker if requested
  if (options.useCircuitBreaker) {
    const { circuitBreakerRegistry, CircuitBreakerPresets } = await import('./circuit-breaker');
    const breaker = circuitBreakerRegistry.get(
      `rpc:${operationName}`,
      CircuitBreakerPresets.rpcCall,
    );
    return breaker.execute(execute);
  }

  return execute();
}

/**
 * Retry with backoff for API calls (external services)
 * Optionally uses circuit breaker to prevent cascading failures
 */
export async function retryApiCall<T>(
  fn: () => Promise<T>,
  operationName: string,
  options: { useCircuitBreaker?: boolean } = {},
): Promise<T> {
  const execute = () =>
    retryWithBackoff(fn, {
      maxAttempts: 2,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      shouldRetry: isRetryableError,
      onRetry: (error, attempt, delayMs) => {
        logger.info(`Retrying ${operationName} (attempt ${attempt})`, {
          error: error instanceof Error ? error.message : String(error),
          delayMs: Math.round(delayMs),
        });
      },
    });

  // Use circuit breaker if requested
  if (options.useCircuitBreaker) {
    const { circuitBreakerRegistry, CircuitBreakerPresets } = await import('./circuit-breaker');
    const breaker = circuitBreakerRegistry.get(
      `api:${operationName}`,
      CircuitBreakerPresets.externalApi,
    );
    return breaker.execute(execute);
  }

  return execute();
}
