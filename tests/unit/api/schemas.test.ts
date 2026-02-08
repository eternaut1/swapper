import {
  balancesQuerySchema,
  confirmSchema,
  executeSchema,
  historyQuerySchema,
  parseRequest,
  quoteSchema,
} from '@/lib/api/schemas';
import { ValidationError } from '@/lib/errors';

// Valid Solana address (base58, 32-44 chars)
const VALID_SOL_ADDR = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// Valid EVM address
const VALID_EVM_ADDR = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

describe('quoteSchema', () => {
  const validQuote = {
    sourceToken: VALID_SOL_ADDR,
    sourceAmount: '100',
    destChain: '1',
    destToken: VALID_EVM_ADDR,
    userWallet: VALID_SOL_ADDR,
    destWallet: VALID_EVM_ADDR,
  };

  it('accepts valid quote request', () => {
    const result = quoteSchema.safeParse(validQuote);
    expect(result.success).toBe(true);
  });

  it('rejects missing sourceToken', () => {
    const result = quoteSchema.safeParse({ ...validQuote, sourceToken: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid EVM destToken', () => {
    const result = quoteSchema.safeParse({ ...validQuote, destToken: 'not-an-address' });
    expect(result.success).toBe(false);
  });

  it('rejects zero amount', () => {
    const result = quoteSchema.safeParse({ ...validQuote, sourceAmount: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = quoteSchema.safeParse({ ...validQuote, sourceAmount: '-5' });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric amount', () => {
    const result = quoteSchema.safeParse({ ...validQuote, sourceAmount: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects too-short Solana address', () => {
    const result = quoteSchema.safeParse({ ...validQuote, userWallet: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('executeSchema', () => {
  const validExecute = {
    quote: { provider: 'relay', quoteId: '123' },
    userWallet: VALID_SOL_ADDR,
  };

  it('accepts valid execute request with default feeToken', () => {
    const result = executeSchema.safeParse(validExecute);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.feeToken).toBe('USDC');
    }
  });

  it('accepts SOL feeToken', () => {
    const result = executeSchema.safeParse({ ...validExecute, feeToken: 'SOL' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid feeToken', () => {
    const result = executeSchema.safeParse({ ...validExecute, feeToken: 'ETH' });
    expect(result.success).toBe(false);
  });
});

describe('confirmSchema', () => {
  it('accepts valid confirm request', () => {
    const result = confirmSchema.safeParse({
      swapId: 'abc-123',
      signedTransaction: 'base64data',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty swapId', () => {
    const result = confirmSchema.safeParse({
      swapId: '',
      signedTransaction: 'data',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty signedTransaction', () => {
    const result = confirmSchema.safeParse({
      swapId: 'abc',
      signedTransaction: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('balancesQuerySchema', () => {
  it('accepts valid Solana wallet', () => {
    const result = balancesQuerySchema.safeParse({ wallet: VALID_SOL_ADDR });
    expect(result.success).toBe(true);
  });

  it('rejects short wallet', () => {
    const result = balancesQuerySchema.safeParse({ wallet: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('historyQuerySchema', () => {
  it('accepts valid query with defaults', () => {
    const result = historyQuerySchema.safeParse({ wallet: VALID_SOL_ADDR });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('coerces string limit to number', () => {
    const result = historyQuerySchema.safeParse({ wallet: VALID_SOL_ADDR, limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it('clamps limit to max 200', () => {
    const result = historyQuerySchema.safeParse({ wallet: VALID_SOL_ADDR, limit: 500 });
    expect(result.success).toBe(false);
  });

  it('rejects limit below 1', () => {
    const result = historyQuerySchema.safeParse({ wallet: VALID_SOL_ADDR, limit: 0 });
    expect(result.success).toBe(false);
  });
});

describe('parseRequest', () => {
  it('returns parsed data on success', () => {
    const data = parseRequest({ swapId: 'abc', signedTransaction: 'data' }, confirmSchema);
    expect(data.swapId).toBe('abc');
  });

  it('throws ValidationError on failure', () => {
    expect(() => parseRequest({}, confirmSchema)).toThrow(ValidationError);
  });

  it('includes field path in error message', () => {
    try {
      parseRequest({ swapId: '', signedTransaction: '' }, confirmSchema);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain('swapId');
    }
  });
});
