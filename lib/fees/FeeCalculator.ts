import { address, createSolanaRpc } from '@solana/kit';
import Decimal from 'decimal.js';
import {
  FEE_VOLATILITY_BUFFER,
  LAMPORTS_PER_SOL,
  PLATFORM_FEE_BPS,
  SOLANA_RPC_URL,
} from '@/lib/config/constants';
import { PriceOracleError } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';
import type { CostBreakdown } from '@/types/bridge';
import type { UserFee } from '@/types/swap';

// Pyth push oracle SOL/USD PriceUpdateV2 account (sponsored by Pyth Data Association)
const PYTH_SOL_USD_PRICE_ACCOUNT = address('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE');
// Max staleness: reject prices older than 5 minutes
const MAX_PRICE_AGE_SECONDS = 300;

export class FeeCalculator {
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly PRICE_CACHE_TTL = 60000; // 1 minute
  private rpc: ReturnType<typeof createSolanaRpc>;

  constructor() {
    this.rpc = createSolanaRpc(SOLANA_RPC_URL);
  }

  /**
   * Calculate minimum fee to cover sponsor costs + buffer
   * Returns fees in both USDC and SOL for user choice
   */
  async calculateMinimumFee(
    costs: CostBreakdown,
    volatilityBuffer: number = FEE_VOLATILITY_BUFFER,
  ): Promise<{ feeInUsdc: number; feeInSol: number }> {
    // Get current SOL/USD price
    const solPriceUsd = await this.getSolPrice();

    // Calculate total sponsor cost in SOL
    const totalCostLamports = costs.totalSponsorCost;
    const totalCostSol = totalCostLamports / LAMPORTS_PER_SOL;

    // Add volatility buffer (default 15%)
    const bufferedCostSol = totalCostSol * (1 + volatilityBuffer);

    // Add platform fee (in basis points)
    const platformFeeMultiplier = 1 + PLATFORM_FEE_BPS / 10000;
    const finalCostSol = bufferedCostSol * platformFeeMultiplier;

    // Convert to USD for USDC fee
    const finalCostUsd = finalCostSol * solPriceUsd;

    // USDC has 6 decimals — round UP to ensure fee always covers costs
    const feeInUsdc = new Decimal(finalCostUsd).toDecimalPlaces(6, Decimal.ROUND_UP).toNumber();

    // SOL has 9 decimals — round UP
    const feeInSol = new Decimal(finalCostSol).toDecimalPlaces(9, Decimal.ROUND_UP).toNumber();

    return {
      feeInUsdc,
      feeInSol,
    };
  }

  /**
   * Validate that user fee covers all sponsor costs with safety margin
   */
  validateFeeCoverage(userFee: UserFee, sponsorCosts: CostBreakdown): boolean {
    try {
      // Convert user fee to USD value for comparison
      const feeValueUsd = userFee.valueUSD;

      // Convert sponsor costs to USD
      const costSol = sponsorCosts.totalSponsorCost / LAMPORTS_PER_SOL;
      const solPrice = this.getCachedSolPrice();
      const costUsd = costSol * solPrice;

      // User fee must cover costs + volatility buffer
      const requiredMinimum = costUsd * (1 + FEE_VOLATILITY_BUFFER);

      return feeValueUsd >= requiredMinimum;
    } catch (error) {
      logger.error(
        'Failed to validate fee coverage:',
        error instanceof Error ? error : { error: String(error) },
      );
      return false;
    }
  }

  /**
   * Calculate quote drift threshold before re-quote is required
   */
  calculateDriftThreshold(destAmount: string, maxDriftPercent: number = 0.02): number {
    const amount = new Decimal(destAmount);
    const threshold = amount.mul(maxDriftPercent);
    return threshold.toNumber();
  }

  /**
   * Convert fee between SOL and USDC
   */
  async convertFee(amount: number, from: 'SOL' | 'USDC', to: 'SOL' | 'USDC'): Promise<number> {
    if (from === to) {
      return amount;
    }

    const solPrice = await this.getSolPrice();

    if (from === 'SOL' && to === 'USDC') {
      return new Decimal(amount).mul(solPrice).toNumber();
    } else {
      // from === 'USDC' && to === 'SOL'
      return new Decimal(amount).div(solPrice).toNumber();
    }
  }

  /**
   * Calculate net amount after all fees and costs
   */
  calculateNetAmount(destAmount: string, bridgeFees: number, userFee: UserFee): number {
    const dest = new Decimal(destAmount);
    const fees = new Decimal(bridgeFees);
    const userFeeValue = new Decimal(userFee.valueUSD);

    return dest.minus(fees).minus(userFeeValue).toNumber();
  }

  /**
   * Get current SOL/USD price from Pyth on-chain oracle.
   * Returns cached value if still within TTL, otherwise fetches fresh.
   * Throws PriceOracleError if price cannot be obtained.
   */
  private async getSolPrice(): Promise<number> {
    // Check cache first
    const cached = this.priceCache.get('SOL/USD');
    if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
      return cached.price;
    }

    try {
      const price = await this.fetchPythPriceOnchain();

      // Cache the price
      this.priceCache.set('SOL/USD', {
        price,
        timestamp: Date.now(),
      });

      return price;
    } catch (error) {
      logger.error(
        'Failed to fetch SOL price:',
        error instanceof Error ? error : { error: String(error) },
      );

      // Allow stale cache as brief fallback (oracle may be temporarily slow)
      if (cached) {
        logger.warn(
          `Using stale SOL price ($${cached.price}, ${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`,
        );
        return cached.price;
      }

      throw new PriceOracleError(
        'SOL price unavailable: Pyth oracle returned no valid price and no cache exists',
        { cause: error },
      );
    }
  }

  /**
   * Fetch SOL/USD price from Pyth push oracle PriceUpdateV2 account.
   *
   * Layout:
   *   [8 discriminator][32 write_authority][1 verification_level]
   *   PriceFeedMessage (found by scanning for feed ID):
   *     [32 feed_id][8 price (i64)][8 conf (u64)][4 expo (i32)][8 publish_time (i64)]...
   */
  private async fetchPythPriceOnchain(): Promise<number> {
    const accountInfo = await this.rpc
      .getAccountInfo(PYTH_SOL_USD_PRICE_ACCOUNT, { encoding: 'base64' })
      .send();

    if (!accountInfo.value) {
      throw new PriceOracleError('Pyth SOL/USD price account not found on-chain');
    }

    const data = Buffer.from(accountInfo.value.data[0], 'base64');

    // Find PriceFeedMessage start: scan for the SOL/USD feed ID
    // to be resilient to VerificationLevel enum size changes
    const FEED_ID = Buffer.from(
      'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
      'hex',
    );
    const feedOffset = data.indexOf(FEED_ID);
    if (feedOffset < 0) {
      throw new PriceOracleError('SOL/USD feed ID not found in Pyth account data');
    }

    const base = feedOffset + 32; // skip feed_id
    const price = data.readBigInt64LE(base);
    const exponent = data.readInt32LE(base + 16);
    const publishTime = Number(data.readBigInt64LE(base + 20));

    // Staleness check
    const age = Math.floor(Date.now() / 1000) - publishTime;
    if (age > MAX_PRICE_AGE_SECONDS) {
      throw new PriceOracleError(
        `Pyth on-chain price is stale (${age}s old, max ${MAX_PRICE_AGE_SECONDS}s)`,
      );
    }

    const actualPrice = Number(price) * 10 ** exponent;

    if (actualPrice < 10 || actualPrice > 1000) {
      throw new PriceOracleError(`Pyth price seems unreasonable: $${actualPrice}`);
    }

    return actualPrice;
  }

  /**
   * Get cached SOL price (for synchronous operations).
   * Throws PriceOracleError if no cached price is available.
   */
  private getCachedSolPrice(): number {
    const cached = this.priceCache.get('SOL/USD');
    if (cached) {
      return cached.price;
    }
    throw new PriceOracleError('No cached SOL price available — call getSolPrice() first');
  }

  /**
   * Get USDC price (assumed to be $1, but can be dynamic)
   */
  async getUsdcPrice(): Promise<number> {
    // USDC is pegged to $1
    // In production, might want to check actual price
    return 1.0;
  }

  /**
   * Calculate fee in lamports
   */
  async calculateFeeInLamports(feeInSol: number): Promise<number> {
    return Math.ceil(feeInSol * LAMPORTS_PER_SOL);
  }

  /**
   * Calculate fee in smallest token unit
   */
  calculateFeeInTokenUnits(fee: number, decimals: number): bigint {
    const multiplier = new Decimal(10).pow(decimals);
    const tokenUnits = new Decimal(fee).mul(multiplier);
    return BigInt(tokenUnits.toFixed(0));
  }
}

// Export singleton instance
export const feeCalculator = new FeeCalculator();
