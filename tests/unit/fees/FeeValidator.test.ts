import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { FeeValidator } from '@/lib/fees/FeeValidator';
import type { BridgeQuote, CostBreakdown } from '@/types/bridge';
import type { UserFee } from '@/types/swap';

// Mock FeeCalculator used by FeeValidator
jest.mock('@/lib/fees/FeeCalculator', () => {
  const mockCalculator = {
    validateFeeCoverage: jest.fn().mockReturnValue(true),
    calculateMinimumFee: jest.fn().mockResolvedValue({ feeInUsdc: 0.01, feeInSol: 0.0001 }),
    convertFee: jest.fn().mockResolvedValue(0.01),
    calculateDriftThreshold: jest.fn().mockReturnValue(20),
  };
  return {
    FeeCalculator: jest.fn().mockImplementation(() => mockCalculator),
    feeCalculator: mockCalculator,
  };
});

// Helper to generate a random base58-like address for testing
function randomAddress(): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

describe('FeeValidator', () => {
  let validator: FeeValidator;

  beforeEach(() => {
    validator = new FeeValidator();
  });

  describe('validateTransactionStructure', () => {
    it('should pass when first instruction is SystemProgram transfer', () => {
      const otherProgramKey = randomAddress();

      const staticAccountKeys = [
        randomAddress(), // fee payer
        randomAddress(), // user
        SYSTEM_PROGRAM_ADDRESS, // SystemProgram
        otherProgramKey, // bridge program
      ];

      const compiledInstructions = [
        { programIdIndex: 2, accountKeyIndexes: [0, 1], data: new Uint8Array([2, 0, 0, 0]) },
        { programIdIndex: 3, accountKeyIndexes: [1], data: new Uint8Array([1]) },
      ];

      const result = validator.validateTransactionStructure(
        compiledInstructions,
        staticAccountKeys,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass when first instruction is Token Program transfer', () => {
      const staticAccountKeys = [
        randomAddress(), // fee payer
        randomAddress(), // user
        TOKEN_PROGRAM_ADDRESS, // Token Program
        randomAddress(), // bridge program
      ];

      const compiledInstructions = [
        { programIdIndex: 2, accountKeyIndexes: [0, 1], data: new Uint8Array([3]) },
        { programIdIndex: 3, accountKeyIndexes: [1], data: new Uint8Array([1]) },
      ];

      const result = validator.validateTransactionStructure(
        compiledInstructions,
        staticAccountKeys,
      );

      expect(result.valid).toBe(true);
    });

    it('should pass when first instruction is Token-2022 Program transfer', () => {
      const staticAccountKeys = [
        randomAddress(),
        randomAddress(),
        TOKEN_2022_PROGRAM_ADDRESS,
        randomAddress(),
      ];

      const compiledInstructions = [
        { programIdIndex: 2, accountKeyIndexes: [0, 1], data: new Uint8Array([3]) },
        { programIdIndex: 3, accountKeyIndexes: [1], data: new Uint8Array([1]) },
      ];

      const result = validator.validateTransactionStructure(
        compiledInstructions,
        staticAccountKeys,
      );

      expect(result.valid).toBe(true);
    });

    it('should fail when first instruction is not a transfer program', () => {
      const randomProgram = randomAddress();

      const staticAccountKeys = [randomAddress(), randomProgram, SYSTEM_PROGRAM_ADDRESS];

      const compiledInstructions = [
        { programIdIndex: 1, accountKeyIndexes: [0], data: new Uint8Array([1]) }, // random program first
        { programIdIndex: 2, accountKeyIndexes: [0], data: new Uint8Array([2, 0, 0, 0]) },
      ];

      const result = validator.validateTransactionStructure(
        compiledInstructions,
        staticAccountKeys,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'First instruction must be fee transfer (SystemProgram or TokenProgram)',
      );
    });

    it('should fail when there are fewer than 2 instructions', () => {
      const staticAccountKeys = [randomAddress(), SYSTEM_PROGRAM_ADDRESS];

      const compiledInstructions = [
        { programIdIndex: 1, accountKeyIndexes: [0], data: new Uint8Array([2, 0, 0, 0]) },
      ];

      const result = validator.validateTransactionStructure(
        compiledInstructions,
        staticAccountKeys,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Transaction must have at least 2 instructions');
    });

    it('should fail when instructions are empty', () => {
      const result = validator.validateTransactionStructure([], []);

      expect(result.valid).toBe(false);
    });

    it('should fail when program ID cannot be resolved', () => {
      const compiledInstructions = [
        { programIdIndex: 99, accountKeyIndexes: [0], data: new Uint8Array([1]) },
        { programIdIndex: 0, accountKeyIndexes: [0], data: new Uint8Array([1]) },
      ];

      const result = validator.validateTransactionStructure(compiledInstructions, []);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cannot resolve program ID for first instruction');
    });
  });

  describe('validateQuoteDrift', () => {
    it('should accept drift within threshold', () => {
      const validation = { isValid: true, driftPercentage: 0.01 };
      expect(validator.validateQuoteDrift(validation, 0.02)).toBe(true);
    });

    it('should reject drift above threshold', () => {
      const validation = { isValid: true, driftPercentage: 0.05 };
      expect(validator.validateQuoteDrift(validation, 0.02)).toBe(false);
    });

    it('should reject invalid quotes regardless of drift', () => {
      const validation = { isValid: false, driftPercentage: 0.001 };
      expect(validator.validateQuoteDrift(validation, 0.02)).toBe(false);
    });

    it('should accept custom drift threshold', () => {
      const validation = { isValid: true, driftPercentage: 0.04 };
      expect(validator.validateQuoteDrift(validation, 0.05)).toBe(true);
      expect(validator.validateQuoteDrift(validation, 0.03)).toBe(false);
    });
  });

  describe('validateSufficientBalance', () => {
    it('should pass when balance covers swap + fees', async () => {
      const result = await validator.validateSufficientBalance(
        BigInt(1_000_000),
        BigInt(500_000),
        BigInt(10_000),
      );
      expect(result.valid).toBe(true);
    });

    it('should fail when balance is insufficient', async () => {
      const result = await validator.validateSufficientBalance(
        BigInt(100),
        BigInt(500_000),
        BigInt(10_000),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should include transfer fee in total required', async () => {
      const result = await validator.validateSufficientBalance(
        BigInt(510_000),
        BigInt(500_000),
        BigInt(10_000),
        BigInt(5_000), // transfer fee pushes total to 515_000
      );
      expect(result.valid).toBe(false);
    });
  });

  describe('validateNoFundLeak', () => {
    const { feeCalculator } = require('@/lib/fees/FeeCalculator');

    it('should pass when fee covers costs', () => {
      feeCalculator.validateFeeCoverage.mockReturnValue(true);

      const userFee: UserFee = { token: 'USDC', amount: 0.01, valueUSD: 0.01 };
      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        totalSponsorCost: 15000,
      };

      const result = validator.validateNoFundLeak(userFee, costs);
      expect(result.valid).toBe(true);
    });

    it('should fail when fee does not cover costs', () => {
      feeCalculator.validateFeeCoverage.mockReturnValue(false);

      const userFee: UserFee = { token: 'USDC', amount: 0.0001, valueUSD: 0.0001 };
      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        totalSponsorCost: 15000,
      };

      const result = validator.validateNoFundLeak(userFee, costs);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('fund leak');
    });
  });

  describe('validateEconomicGuarantees', () => {
    const { feeCalculator } = require('@/lib/fees/FeeCalculator');

    const validQuote: BridgeQuote = {
      provider: 'relay',
      quoteId: 'test-1',
      sourceAmount: '1000000',
      destAmount: '1000',
      estimatedDuration: 300,
      validUntil: new Date(Date.now() + 60000),
      route: { steps: [], totalFees: '0' },
      estimatedCosts: {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        totalSponsorCost: 15000,
      },
      rawQuote: {},
    };

    it('should pass with valid fee and non-expired quote', async () => {
      feeCalculator.validateFeeCoverage.mockReturnValue(true);

      const userFee: UserFee = { token: 'USDC', amount: 0.01, valueUSD: 0.01 };
      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        totalSponsorCost: 15000,
      };

      const result = await validator.validateEconomicGuarantees(validQuote, userFee, costs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail with expired quote', async () => {
      feeCalculator.validateFeeCoverage.mockReturnValue(true);

      const expiredQuote = {
        ...validQuote,
        validUntil: new Date(Date.now() - 10000), // expired
      };

      const userFee: UserFee = { token: 'USDC', amount: 0.01, valueUSD: 0.01 };
      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        totalSponsorCost: 15000,
      };

      const result = await validator.validateEconomicGuarantees(expiredQuote, userFee, costs);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quote has expired');
    });

    it('should fail when fee does not cover costs', async () => {
      feeCalculator.validateFeeCoverage.mockReturnValue(false);

      const userFee: UserFee = { token: 'USDC', amount: 0.0001, valueUSD: 0.0001 };
      const costs: CostBreakdown = {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        totalSponsorCost: 15000,
      };

      const result = await validator.validateEconomicGuarantees(validQuote, userFee, costs);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('User fee does not cover sponsor costs');
    });
  });
});
