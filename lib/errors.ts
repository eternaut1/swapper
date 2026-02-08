/**
 * Application error hierarchy.
 * Each error carries an `errorCode` that is safe to expose to API clients
 * and an HTTP `statusCode` for the API layer.
 */

export class AppError extends Error {
  /** Machine-readable code safe for API responses */
  readonly errorCode: string;
  /** Suggested HTTP status code */
  readonly statusCode: number;

  constructor(message: string, errorCode: string, statusCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'VALIDATION_ERROR', 400, options);
    this.name = 'ValidationError';
  }
}

export class MissingFieldError extends ValidationError {
  constructor(field: string) {
    super(`Missing required field: ${field}`);
    this.name = 'MissingFieldError';
  }
}

// ── Not Found ───────────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

// ── Quote / Pricing ─────────────────────────────────────────────────────────

export class QuoteError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'QUOTE_ERROR', 400, options);
    this.name = 'QuoteError';
  }
}

export class QuoteDriftError extends QuoteError {
  constructor(driftPercent: number) {
    super(`Quote drift too high: ${driftPercent.toFixed(2)}%. Please refresh quote.`);
    this.name = 'QuoteDriftError';
  }
}

export class QuoteExpiredError extends QuoteError {
  constructor() {
    super('Quote expired. Please request a new quote.');
    this.name = 'QuoteExpiredError';
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(required: string, current: string) {
    super(`Insufficient balance. Need ${required}, have ${current}`, 'INSUFFICIENT_BALANCE', 400);
    this.name = 'InsufficientBalanceError';
  }
}

// ── Fee / Economics ─────────────────────────────────────────────────────────

export class FeeError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'FEE_ERROR', 400, options);
    this.name = 'FeeError';
  }
}

export class EconomicValidationError extends FeeError {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Economic validation failed: ${violations.join(', ')}`);
    this.name = 'EconomicValidationError';
    this.violations = violations;
  }
}

export class PriceOracleError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'PRICE_ORACLE_ERROR', 503, options);
    this.name = 'PriceOracleError';
  }
}

// ── Bridge / Provider ───────────────────────────────────────────────────────

export class BridgeError extends AppError {
  readonly provider: string;

  constructor(message: string, provider: string, options?: ErrorOptions) {
    super(message, 'BRIDGE_ERROR', 502, options);
    this.name = 'BridgeError';
    this.provider = provider;
  }
}

// ── Transaction ─────────────────────────────────────────────────────────────

export class TransactionError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'TRANSACTION_ERROR', 500, options);
    this.name = 'TransactionError';
  }
}

export class TransactionValidationError extends TransactionError {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Transaction validation failed: ${violations.join(', ')}`);
    this.name = 'TransactionValidationError';
    this.violations = violations;
  }
}

// ── Configuration ───────────────────────────────────────────────────────────

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', 500);
    this.name = 'ConfigError';
  }
}

// ── Helper: duck-type check for AppError ─────────────────────────────────────
// `instanceof` can fail across turbopack chunks in Next.js dev mode, so we also
// check for the properties that AppError guarantees.

function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  if (!(error instanceof Error)) return false;
  const err = error as unknown as Record<string, unknown>;
  return typeof err['errorCode'] === 'string' && typeof err['statusCode'] === 'number';
}

// ── Helper: build a safe JSON response body from any error ──────────────────

export function toErrorResponse(error: unknown): {
  success: false;
  error: string;
  errorCode: string;
} {
  if (isAppError(error)) {
    return {
      success: false,
      error: error.message,
      errorCode: error.errorCode,
    };
  }

  // Never expose raw internal error messages to clients
  return {
    success: false,
    error: 'An unexpected error occurred. Please try again.',
    errorCode: 'INTERNAL_ERROR',
  };
}

export function toErrorStatusCode(error: unknown): number {
  if (isAppError(error)) return error.statusCode;
  return 500;
}
