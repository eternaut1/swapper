import { formatTokenAmount } from '@/lib/utils/format';

describe('formatTokenAmount', () => {
  it('formats 1 USDC (6 decimals)', () => {
    expect(formatTokenAmount('1000000', 6)).toBe('1');
  });

  it('formats fractional amounts', () => {
    expect(formatTokenAmount('1500000', 6)).toBe('1.5');
  });

  it('formats large amounts with commas', () => {
    expect(formatTokenAmount('1000000000000', 6)).toBe('1,000,000');
  });

  it('formats small dust amounts', () => {
    const result = formatTokenAmount('1', 6);
    expect(result).toBe('0.000001');
  });

  it('returns raw string when decimals is 0', () => {
    expect(formatTokenAmount('1000', 0)).toBe('1000');
  });

  it('returns raw string when input is empty', () => {
    expect(formatTokenAmount('', 6)).toBe('');
  });

  it('respects maxDecimals parameter', () => {
    const result = formatTokenAmount('1234567', 6, 2);
    expect(result).toBe('1.23');
  });

  it('formats SOL amounts (9 decimals)', () => {
    expect(formatTokenAmount('1000000000', 9)).toBe('1');
  });

  it('formats ETH amounts (18 decimals)', () => {
    expect(formatTokenAmount('1000000000000000000', 18)).toBe('1');
  });
});
