import { ProviderRegistry } from '@/lib/bridges/ProviderRegistry';
import type {
  BridgeQuote,
  BuildTransactionResult,
  IBridgeProvider,
  QuoteParams,
} from '@/types/bridge';

// Mock provider implementation
class MockProvider implements IBridgeProvider {
  constructor(
    public name: string,
    private mockQuote: Partial<BridgeQuote> = {},
  ) {}

  async getQuote(params: QuoteParams): Promise<BridgeQuote> {
    return {
      provider: this.name,
      quoteId: `${this.name}-quote-1`,
      sourceAmount: params.sourceAmount,
      destAmount: this.mockQuote.destAmount || '1000',
      estimatedDuration: this.mockQuote.estimatedDuration || 300,
      validUntil: new Date(Date.now() + 30000),
      route: {
        steps: [],
        totalFees: this.mockQuote.route?.totalFees || '10',
      },
      estimatedCosts: {
        solanaGasFee: 5000,
        solanaPriorityFee: 10000,
        bridgeFee: 0,
        totalSponsorCost: 15000,
      },
      rawQuote: {},
    };
  }

  async validateQuote() {
    return { isValid: true, driftPercentage: 0 };
  }

  async buildTransaction(): Promise<BuildTransactionResult> {
    throw new Error('Not implemented');
  }

  async getStatus() {
    return { status: 'pending' as const };
  }

  async supportsRoute() {
    return true;
  }

  async estimateCosts() {
    return {
      solanaGasFee: 5000,
      solanaPriorityFee: 10000,
      bridgeFee: 0,
      totalSponsorCost: 15000,
    };
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('register/unregister', () => {
    it('should register a provider', () => {
      const provider = new MockProvider('test-provider');

      registry.register(provider);

      expect(registry.hasProvider('test-provider')).toBe(true);
      expect(registry.getProviderCount()).toBe(1);
    });

    it('should unregister a provider', () => {
      const provider = new MockProvider('test-provider');
      registry.register(provider);

      registry.unregister('test-provider');

      expect(registry.hasProvider('test-provider')).toBe(false);
      expect(registry.getProviderCount()).toBe(0);
    });

    it('should get a specific provider by name', () => {
      const provider = new MockProvider('test-provider');
      registry.register(provider);

      const retrieved = registry.getProvider('test-provider');

      expect(retrieved).toBe(provider);
      expect(retrieved?.name).toBe('test-provider');
    });

    it('should return undefined for non-existent provider', () => {
      const retrieved = registry.getProvider('non-existent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAggregatedQuotes', () => {
    it('should get quotes from all providers', async () => {
      const provider1 = new MockProvider('provider-1', { destAmount: '1000' });
      const provider2 = new MockProvider('provider-2', { destAmount: '1100' });

      registry.register(provider1);
      registry.register(provider2);

      const params: QuoteParams = {
        sourceChain: 'solana',
        sourceToken: 'token1',
        sourceAmount: '100',
        destChain: '1',
        destToken: 'token2',
        userWallet: 'wallet1',
        destWallet: 'wallet2',
      };

      const result = await registry.getAggregatedQuotes(params);

      expect(result.quotes).toHaveLength(2);
      expect(result.bestQuote).toBeDefined();
      expect(result.recommendedQuote).toBeDefined();
    });

    it('should rank quotes by net amount', async () => {
      const provider1 = new MockProvider('provider-1', {
        destAmount: '1000',
        route: { steps: [], totalFees: '50' }, // Net: 950
      });
      const provider2 = new MockProvider('provider-2', {
        destAmount: '1100',
        route: { steps: [], totalFees: '20' }, // Net: 1080 (better)
      });

      registry.register(provider1);
      registry.register(provider2);

      const params: QuoteParams = {
        sourceChain: 'solana',
        sourceToken: 'token1',
        sourceAmount: '100',
        destChain: '1',
        destToken: 'token2',
        userWallet: 'wallet1',
        destWallet: 'wallet2',
      };

      const result = await registry.getAggregatedQuotes(params);

      expect(result.bestQuote.provider).toBe('provider-2');
    });

    it('should throw error when no providers registered', async () => {
      const params: QuoteParams = {
        sourceChain: 'solana',
        sourceToken: 'token1',
        sourceAmount: '100',
        destChain: '1',
        destToken: 'token2',
        userWallet: 'wallet1',
        destWallet: 'wallet2',
      };

      await expect(registry.getAggregatedQuotes(params)).rejects.toThrow(
        'No bridge providers registered',
      );
    });

    it('should handle provider failures gracefully', async () => {
      const goodProvider = new MockProvider('good-provider', { destAmount: '1000' });
      const badProvider = new MockProvider('bad-provider');

      // Override getQuote to throw error
      badProvider.getQuote = async () => {
        throw new Error('Provider error');
      };

      registry.register(goodProvider);
      registry.register(badProvider);

      const params: QuoteParams = {
        sourceChain: 'solana',
        sourceToken: 'token1',
        sourceAmount: '100',
        destChain: '1',
        destToken: 'token2',
        userWallet: 'wallet1',
        destWallet: 'wallet2',
      };

      const result = await registry.getAggregatedQuotes(params);

      // Should still return quotes from good provider
      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0].provider).toBe('good-provider');
    });
  });

  describe('getAllProviders', () => {
    it('should return all registered providers', () => {
      const provider1 = new MockProvider('provider-1');
      const provider2 = new MockProvider('provider-2');

      registry.register(provider1);
      registry.register(provider2);

      const providers = registry.getAllProviders();

      expect(providers).toHaveLength(2);
      expect(providers).toContain(provider1);
      expect(providers).toContain(provider2);
    });

    it('should return empty array when no providers registered', () => {
      const providers = registry.getAllProviders();

      expect(providers).toHaveLength(0);
    });
  });
});
