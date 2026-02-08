import {
  isRetryableError,
  MaxRetriesExceededError,
  RetryableError,
  retryWithBackoff,
} from '@/lib/utils/retry';

jest.mock('@/lib/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('retryWithBackoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('succeeds on first attempt', async () => {
    const result = await retryWithBackoff(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('retries and succeeds on second attempt', async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('transient'));
      return Promise.resolve('recovered');
    };

    const promise = retryWithBackoff(fn, {
      maxAttempts: 3,
      initialDelayMs: 100,
    });

    // Advance timers to allow retry delay
    await jest.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(attempt).toBe(2);
  });

  it('throws MaxRetriesExceededError after exhausting attempts', async () => {
    jest.useRealTimers();
    const fn = () => Promise.reject(new Error('always fails'));

    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 2,
        initialDelayMs: 1,
        maxDelayMs: 1,
      }),
    ).rejects.toThrow(MaxRetriesExceededError);
    jest.useFakeTimers();
  });

  it('MaxRetriesExceededError includes attempt count and last error', async () => {
    jest.useRealTimers();
    const lastErr = new Error('persistent');
    const fn = () => Promise.reject(lastErr);

    try {
      await retryWithBackoff(fn, {
        maxAttempts: 2,
        initialDelayMs: 1,
        maxDelayMs: 1,
      });
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MaxRetriesExceededError);
      const mre = err as MaxRetriesExceededError;
      expect(mre.attempts).toBe(2);
      expect(mre.lastError).toBe(lastErr);
    }
    jest.useFakeTimers();
  });

  it('stops retrying when shouldRetry returns false', async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      return Promise.reject(new Error('nope'));
    };

    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 5,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow('nope');

    expect(attempt).toBe(1);
  });

  it('calls onRetry callback before each retry', async () => {
    const onRetry = jest.fn();
    let attempt = 0;

    const fn = () => {
      attempt++;
      if (attempt < 3) return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    };

    const promise = retryWithBackoff(fn, {
      maxAttempts: 3,
      initialDelayMs: 50,
      onRetry,
    });

    await jest.advanceTimersByTimeAsync(500);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe(1); // attempt 1
    expect(onRetry.mock.calls[1][1]).toBe(2); // attempt 2
  });
});

describe('isRetryableError', () => {
  it('returns true for RetryableError', () => {
    expect(isRetryableError(new RetryableError('test'))).toBe(true);
  });

  it('returns true for network errors', () => {
    expect(isRetryableError(new Error('network error'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
    expect(isRetryableError(new Error('request timeout'))).toBe(true);
  });

  it('returns true for 5xx status codes', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 502 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 504 })).toBe(true);
    expect(isRetryableError({ statusCode: 500 })).toBe(true);
  });

  it('returns true for retryable 4xx status codes', () => {
    expect(isRetryableError({ status: 408 })).toBe(true); // Request Timeout
    expect(isRetryableError({ status: 429 })).toBe(true); // Too Many Requests
  });

  it('returns false for non-retryable 4xx', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it('returns false for regular errors', () => {
    expect(isRetryableError(new Error('validation failed'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError('string')).toBe(false);
  });
});

describe('RetryableError', () => {
  it('has correct name and cause', () => {
    const cause = new Error('root');
    const err = new RetryableError('wrapped', cause);
    expect(err.name).toBe('RetryableError');
    expect(err.cause).toBe(cause);
  });
});
