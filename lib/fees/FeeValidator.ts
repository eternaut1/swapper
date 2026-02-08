import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { MAX_QUOTE_DRIFT } from '@/lib/config/constants';
import type { BridgeQuote, CostBreakdown, QuoteValidation } from '@/types/bridge';
import type { UserFee } from '@/types/swap';
import { feeCalculator } from './FeeCalculator';

export class FeeValidator {
  /**
   * Validate that all economic guarantees are met before execution
   */
  async validateEconomicGuarantees(
    quote: BridgeQuote,
    userFee: UserFee,
    sponsorCosts: CostBreakdown,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // 1. Check fee coverage
    const coverageValid = feeCalculator.validateFeeCoverage(userFee, sponsorCosts);
    if (!coverageValid) {
      errors.push('User fee does not cover sponsor costs');
    }

    // 2. Check quote expiry
    if (new Date() > quote.validUntil) {
      errors.push('Quote has expired');
    }

    // 3. Validate minimum fee requirements
    const minFees = await feeCalculator.calculateMinimumFee(sponsorCosts);
    const userFeeAmount =
      userFee.token === 'USDC'
        ? userFee.amount
        : await feeCalculator.convertFee(userFee.amount, 'SOL', 'USDC');

    if (userFeeAmount < minFees.feeInUsdc) {
      errors.push(`Fee too low. Minimum required: ${minFees.feeInUsdc} USDC`);
    }

    // 4. Validate costs are reasonable (sanity check)
    const maxReasonableCost = 0.1; // 0.1 SOL max for Solana tx
    const costSol = sponsorCosts.totalSponsorCost / 1_000_000_000;
    if (costSol > maxReasonableCost) {
      errors.push(`Sponsor costs unreasonably high: ${costSol} SOL`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate quote drift is within acceptable range
   */
  validateQuoteDrift(validation: QuoteValidation, maxDrift: number = MAX_QUOTE_DRIFT): boolean {
    return validation.isValid && validation.driftPercentage <= maxDrift;
  }

  /**
   * Validate user has sufficient balance for swap + fees
   */
  async validateSufficientBalance(
    userBalance: bigint,
    swapAmount: bigint,
    feeAmount: bigint,
    transferFee?: bigint,
  ): Promise<{ valid: boolean; error?: string }> {
    const totalRequired = swapAmount + feeAmount + (transferFee || BigInt(0));

    if (userBalance < totalRequired) {
      return {
        valid: false,
        error: `Insufficient balance. Required: ${totalRequired}, Available: ${userBalance}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate no fund leak in transaction
   * Ensures sponsor doesn't accidentally gift funds to user
   */
  validateNoFundLeak(
    userFee: UserFee,
    sponsorCosts: CostBreakdown,
  ): { valid: boolean; warning?: string } {
    // User fee should always be >= sponsor costs
    // If user fee < sponsor costs, sponsor is losing money (leak)

    const coverageValid = feeCalculator.validateFeeCoverage(userFee, sponsorCosts);

    if (!coverageValid) {
      return {
        valid: false,
        warning: 'CRITICAL: User fee does not cover sponsor costs - potential fund leak!',
      };
    }

    return { valid: true };
  }

  /**
   * Validate transaction structure for safety
   * Checks compiled instructions from a transaction message
   */
  validateTransactionStructure(
    compiledInstructions: {
      programIdIndex: number;
      accountKeyIndexes: number[];
      data: Uint8Array;
    }[],
    staticAccountKeys: string[],
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Must have at least 2 instructions (fee transfer + swap)
    if (compiledInstructions.length < 2) {
      errors.push('Transaction must have at least 2 instructions');
    }

    if (compiledInstructions.length === 0) {
      return { valid: false, errors };
    }

    // First instruction must be a fee transfer (SystemProgram or Token transfer)
    const firstIx = compiledInstructions[0];
    if (!firstIx) {
      errors.push('Cannot read first instruction');
      return { valid: false, errors };
    }
    const programId = staticAccountKeys[firstIx.programIdIndex];

    if (!programId) {
      errors.push('Cannot resolve program ID for first instruction');
      return { valid: false, errors };
    }

    const isSystemTransfer = programId === SYSTEM_PROGRAM_ADDRESS;
    const isTokenTransfer =
      programId === TOKEN_PROGRAM_ADDRESS || programId === TOKEN_2022_PROGRAM_ADDRESS;

    if (!isSystemTransfer && !isTokenTransfer) {
      errors.push('First instruction must be fee transfer (SystemProgram or TokenProgram)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate maximum acceptable quote drift amount
   */
  calculateMaxDriftAmount(destAmount: string, maxDriftPercent: number = MAX_QUOTE_DRIFT): string {
    return feeCalculator.calculateDriftThreshold(destAmount, maxDriftPercent).toString();
  }
}

// Export singleton instance
export const feeValidator = new FeeValidator();
