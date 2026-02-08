import { FeeCalculator } from '@/lib/fees/FeeCalculator';
import type { CostBreakdown } from '@/types/bridge';
import type { UserFee } from '@/types/swap';

// Mock SOL price at $150 for deterministic tests — the production code
// fetches from Pyth on-chain oracle (no fallback), so we mock here.
const MOCK_SOL_PRICE = 150;

describe('FeeCalculator', () => {
  let feeCalculator: FeeCalculator;

  beforeEach(() => {
    feeCalculator = new FeeCalculator();
    // Seed the price cache so tests don't require RPC
    (
      feeCalculator as unknown as { priceCache: Map<string, { price: number; timestamp: number }> }
    ).priceCache.set('SOL/USD', { price: MOCK_SOL_PRICE, timestamp: Date.now() });
  });

  describe('calculateMinimumFee', () => {
    it('should calculate fee that covers sponsor costs with buffer', async () => {
      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        accountRentCost: 0,
        totalSponsorCost: 15000,
      };

      const fees = await feeCalculator.calculateMinimumFee(costs, 0.15);

      // Total cost in SOL = 15000 lamports = 0.000015 SOL
      // With 15% buffer = 0.000015 * 1.15 = 0.00001725 SOL
      expect(fees.feeInSol).toBeGreaterThan(0);
      expect(fees.feeInUsdc).toBeGreaterThan(0);
    });

    it('should apply volatility buffer correctly', async () => {
      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        accountRentCost: 0,
        totalSponsorCost: 15000,
      };

      const feesWithLowBuffer = await feeCalculator.calculateMinimumFee(costs, 0.1);
      const feesWithHighBuffer = await feeCalculator.calculateMinimumFee(costs, 0.2);

      expect(feesWithHighBuffer.feeInSol).toBeGreaterThan(feesWithLowBuffer.feeInSol);
      expect(feesWithHighBuffer.feeInUsdc).toBeGreaterThan(feesWithLowBuffer.feeInUsdc);
    });

    it('should never allow negative fees', async () => {
      const costs: CostBreakdown = {
        solanaGasFee: 0,
        solanaPriorityFee: 0,
        bridgeFee: 0,
        accountRentCost: 0,
        totalSponsorCost: 0,
      };

      const fees = await feeCalculator.calculateMinimumFee(costs);

      expect(fees.feeInSol).toBeGreaterThanOrEqual(0);
      expect(fees.feeInUsdc).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateFeeCoverage', () => {
    it('should return true when fee covers costs with buffer', () => {
      const userFee: UserFee = {
        token: 'USDC',
        amount: 1.0,
        valueUSD: 1.0,
      };

      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        accountRentCost: 0,
        totalSponsorCost: 15000, // ~$0.0023 at $150/SOL
      };

      const isValid = feeCalculator.validateFeeCoverage(userFee, costs);
      expect(isValid).toBe(true);
    });

    it('should return false when fee does not cover costs', () => {
      const userFee: UserFee = {
        token: 'USDC',
        amount: 0.001,
        valueUSD: 0.001,
      };

      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        accountRentCost: 2_039_280, // Large rent cost
        totalSponsorCost: 2_054_280,
      };

      const isValid = feeCalculator.validateFeeCoverage(userFee, costs);
      expect(isValid).toBe(false);
    });
  });

  describe('calculateDriftThreshold', () => {
    it('should calculate drift threshold correctly', () => {
      const destAmount = '1000';
      const maxDrift = 0.02; // 2%

      const threshold = feeCalculator.calculateDriftThreshold(destAmount, maxDrift);

      expect(threshold).toBe(20); // 2% of 1000
    });

    it('should handle decimal amounts', () => {
      const destAmount = '123.456';
      const maxDrift = 0.05; // 5%

      const threshold = feeCalculator.calculateDriftThreshold(destAmount, maxDrift);

      expect(threshold).toBeCloseTo(6.1728, 4);
    });
  });

  describe('convertFee', () => {
    it('should return same amount when converting to same token', async () => {
      const amount = 100;

      const converted = await feeCalculator.convertFee(amount, 'USDC', 'USDC');

      expect(converted).toBe(amount);
    });

    it('should convert SOL to USDC', async () => {
      const amount = 1; // 1 SOL

      const converted = await feeCalculator.convertFee(amount, 'SOL', 'USDC');

      // Should be approximately SOL price in USD (mocked or real)
      expect(converted).toBeGreaterThan(0);
    });

    it('should convert USDC to SOL', async () => {
      const amount = 150; // $150

      const converted = await feeCalculator.convertFee(amount, 'USDC', 'SOL');

      // Should be approximately 1 SOL at $150/SOL
      expect(converted).toBeGreaterThan(0);
    });
  });

  describe('calculateFeeInLamports', () => {
    it('should convert SOL to lamports correctly', async () => {
      const feeInSol = 0.001; // 0.001 SOL

      const lamports = await feeCalculator.calculateFeeInLamports(feeInSol);

      expect(lamports).toBe(1_000_000); // 0.001 SOL = 1,000,000 lamports
    });

    it('should round up fractional lamports', async () => {
      const feeInSol = 0.0000000015; // 1.5 lamports

      const lamports = await feeCalculator.calculateFeeInLamports(feeInSol);

      expect(lamports).toBe(2); // Should round up
    });
  });

  describe('calculateFeeInTokenUnits', () => {
    it('should calculate fee in token units for USDC (6 decimals)', () => {
      const fee = 10; // 10 USDC
      const decimals = 6;

      const tokenUnits = feeCalculator.calculateFeeInTokenUnits(fee, decimals);

      expect(tokenUnits).toBe(BigInt(10_000_000)); // 10 * 10^6
    });

    it('should calculate fee in token units for SOL (9 decimals)', () => {
      const fee = 1; // 1 SOL
      const decimals = 9;

      const tokenUnits = feeCalculator.calculateFeeInTokenUnits(fee, decimals);

      expect(tokenUnits).toBe(BigInt(1_000_000_000)); // 1 * 10^9
    });

    it('should handle fractional fees', () => {
      const fee = 0.5; // 0.5 USDC
      const decimals = 6;

      const tokenUnits = feeCalculator.calculateFeeInTokenUnits(fee, decimals);

      expect(tokenUnits).toBe(BigInt(500_000)); // 0.5 * 10^6
    });
  });
});
