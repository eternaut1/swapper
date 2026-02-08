import {
  AppError,
  BridgeError,
  ConfigError,
  EconomicValidationError,
  FeeError,
  InsufficientBalanceError,
  MissingFieldError,
  NotFoundError,
  PriceOracleError,
  QuoteDriftError,
  QuoteError,
  QuoteExpiredError,
  TransactionError,
  TransactionValidationError,
  toErrorResponse,
  toErrorStatusCode,
  ValidationError,
} from '@/lib/errors';

describe('Error classes', () => {
  it('AppError sets errorCode and statusCode', () => {
    const err = new AppError('test', 'TEST_CODE', 418);
    expect(err.message).toBe('test');
    expect(err.errorCode).toBe('TEST_CODE');
    expect(err.statusCode).toBe(418);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('ValidationError uses 400 and VALIDATION_ERROR', () => {
    const err = new ValidationError('bad input');
    expect(err.errorCode).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('ValidationError');
  });

  it('MissingFieldError includes field name', () => {
    const err = new MissingFieldError('email');
    expect(err.message).toBe('Missing required field: email');
    expect(err.errorCode).toBe('VALIDATION_ERROR');
  });

  it('NotFoundError with and without id', () => {
    const err1 = new NotFoundError('User', '123');
    expect(err1.message).toBe('User not found: 123');
    expect(err1.statusCode).toBe(404);

    const err2 = new NotFoundError('Token');
    expect(err2.message).toBe('Token not found');
  });

  it('QuoteError and subclasses', () => {
    const err = new QuoteError('stale');
    expect(err.errorCode).toBe('QUOTE_ERROR');
    expect(err.statusCode).toBe(400);

    const drift = new QuoteDriftError(5.5);
    expect(drift.message).toContain('5.50%');
    expect(drift.name).toBe('QuoteDriftError');

    const expired = new QuoteExpiredError();
    expect(expired.message).toContain('expired');
  });

  it('InsufficientBalanceError includes amounts', () => {
    const err = new InsufficientBalanceError('10 USDC', '5 USDC');
    expect(err.message).toContain('10 USDC');
    expect(err.message).toContain('5 USDC');
    expect(err.errorCode).toBe('INSUFFICIENT_BALANCE');
    expect(err.statusCode).toBe(400);
  });

  it('FeeError and EconomicValidationError', () => {
    const fee = new FeeError('too low');
    expect(fee.errorCode).toBe('FEE_ERROR');

    const econ = new EconomicValidationError(['fee < cost', 'drift too high']);
    expect(econ.message).toContain('fee < cost');
    expect(econ.violations).toHaveLength(2);
  });

  it('PriceOracleError uses 503', () => {
    const err = new PriceOracleError('oracle down');
    expect(err.statusCode).toBe(503);
    expect(err.errorCode).toBe('PRICE_ORACLE_ERROR');
  });

  it('BridgeError includes provider', () => {
    const err = new BridgeError('timeout', 'relay');
    expect(err.provider).toBe('relay');
    expect(err.statusCode).toBe(502);
    expect(err.errorCode).toBe('BRIDGE_ERROR');
  });

  it('TransactionError and TransactionValidationError', () => {
    const err = new TransactionError('failed');
    expect(err.errorCode).toBe('TRANSACTION_ERROR');
    expect(err.statusCode).toBe(500);

    const val = new TransactionValidationError(['too large', 'invalid signer']);
    expect(val.violations).toHaveLength(2);
    expect(val.message).toContain('too large');
  });

  it('ConfigError uses 500', () => {
    const err = new ConfigError('missing key');
    expect(err.statusCode).toBe(500);
    expect(err.errorCode).toBe('CONFIG_ERROR');
  });
});

describe('toErrorResponse', () => {
  it('returns AppError message and code for AppError instances', () => {
    const err = new ValidationError('bad field');
    const resp = toErrorResponse(err);
    expect(resp).toEqual({
      success: false,
      error: 'bad field',
      errorCode: 'VALIDATION_ERROR',
    });
  });

  it('returns generic message for non-AppError', () => {
    const resp = toErrorResponse(new Error('internal details'));
    expect(resp.error).toBe('An unexpected error occurred. Please try again.');
    expect(resp.errorCode).toBe('INTERNAL_ERROR');
  });

  it('returns generic message for non-Error values', () => {
    const resp = toErrorResponse('string error');
    expect(resp.errorCode).toBe('INTERNAL_ERROR');
  });

  it('duck-types AppError properties for cross-chunk compatibility', () => {
    // Simulate an error from a different chunk that has the right shape
    const fakeAppError = new Error('fake');
    (fakeAppError as unknown as Record<string, unknown>)['errorCode'] = 'FAKE_CODE';
    (fakeAppError as unknown as Record<string, unknown>)['statusCode'] = 422;

    const resp = toErrorResponse(fakeAppError);
    expect(resp.error).toBe('fake');
    expect(resp.errorCode).toBe('FAKE_CODE');
  });
});

describe('toErrorStatusCode', () => {
  it('returns statusCode from AppError', () => {
    expect(toErrorStatusCode(new NotFoundError('x'))).toBe(404);
    expect(toErrorStatusCode(new PriceOracleError('x'))).toBe(503);
  });

  it('returns 500 for non-AppError', () => {
    expect(toErrorStatusCode(new Error('boom'))).toBe(500);
    expect(toErrorStatusCode(null)).toBe(500);
  });
});
