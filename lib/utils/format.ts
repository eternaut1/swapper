/**
 * Format a base-unit token amount to a human-readable string.
 * @param raw     Raw amount string in base units (e.g. "1000000")
 * @param decimals Token decimals (e.g. 6 for USDC)
 * @param maxDecimals Max fractional digits to display (default: 6)
 */
export function formatTokenAmount(raw: string, decimals: number, maxDecimals = 6): string {
  if (!raw || decimals === 0) return raw;
  const num = Number(raw) / 10 ** decimals;
  return num.toLocaleString('en-US', {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  });
}
