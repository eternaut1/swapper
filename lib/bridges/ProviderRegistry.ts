import { logger } from '@/lib/utils/logger';
import type {
  AggregatedQuotes,
  BridgeQuote,
  IBridgeProvider,
  ProviderResult,
  QuoteParams,
} from '@/types/bridge';

export class ProviderRegistry {
  private providers: Map<string, IBridgeProvider> = new Map();

  /**
   * Register a bridge provider
   */
  register(provider: IBridgeProvider): void {
    this.providers.set(provider.name, provider);
    logger.info(`Registered bridge provider: ${provider.name}`);
  }

  /**
   * Unregister a bridge provider
   */
  unregister(providerName: string): void {
    this.providers.delete(providerName);
    logger.info(`Unregistered bridge provider: ${providerName}`);
  }

  /**
   * Get a specific provider by name
   */
  getProvider(name: string): IBridgeProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): IBridgeProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get quotes from all providers in parallel
   */
  async getAggregatedQuotes(params: QuoteParams): Promise<AggregatedQuotes> {
    const providers = this.getAllProviders();

    if (providers.length === 0) {
      throw new Error('No bridge providers registered');
    }

    const providerResults: ProviderResult[] = [];

    // Filter to providers that support this route
    const supportChecks = await Promise.all(
      providers.map(async (provider) => {
        try {
          const supported = await provider.supportsRoute(params);
          if (!supported) {
            providerResults.push({ provider: provider.name, status: 'no_route' });
          }
          return { provider, supported };
        } catch {
          return { provider, supported: true }; // On error, let quote call decide
        }
      }),
    );

    const eligibleProviders = supportChecks.filter((c) => c.supported).map((c) => c.provider);

    if (eligibleProviders.length === 0) {
      throw new Error('No providers support this token pair');
    }

    // Fetch quotes from eligible providers in parallel
    const quotePromises = eligibleProviders.map(async (provider) => {
      try {
        const quote = await provider.getQuote(params);
        providerResults.push({ provider: provider.name, status: 'success' });
        return quote;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to get quote from ${provider.name}:`, { error: message });
        providerResults.push({ provider: provider.name, status: 'error', error: message });
        return null;
      }
    });

    const quotes = (await Promise.all(quotePromises)).filter((q): q is BridgeQuote => q !== null);

    if (quotes.length === 0) {
      throw new Error('Failed to get quotes from any provider');
    }

    // Rank quotes
    const rankedQuotes = this.rankQuotes(quotes);

    return {
      quotes: rankedQuotes,
      bestQuote: rankedQuotes[0]!,
      recommendedQuote: this.selectRecommendedQuote(rankedQuotes),
      providerResults,
    };
  }

  /**
   * Rank quotes by net amount received (considering all costs)
   * Higher net amount = better quote
   */
  private rankQuotes(quotes: BridgeQuote[]): BridgeQuote[] {
    return quotes.sort((a, b) => {
      const aNet = this.calculateNetAmount(a);
      const bNet = this.calculateNetAmount(b);
      return bNet - aNet; // Descending order
    });
  }

  /**
   * Calculate net amount received after all fees
   */
  private calculateNetAmount(quote: BridgeQuote): number {
    const destAmount = parseFloat(quote.destAmount);
    const totalFees = parseFloat(quote.route.totalFees);
    return destAmount - totalFees;
  }

  /**
   * Select recommended quote considering both amount and speed
   */
  private selectRecommendedQuote(rankedQuotes: BridgeQuote[]): BridgeQuote {
    if (rankedQuotes.length === 1) {
      return rankedQuotes[0]!;
    }

    // Score each quote: 70% weight on amount, 30% on speed
    const scoredQuotes = rankedQuotes.map((quote) => {
      const netAmount = this.calculateNetAmount(quote);
      const maxAmount = this.calculateNetAmount(rankedQuotes[0]!);

      // Normalize amount score (0-1)
      const amountScore = netAmount / maxAmount;

      // Normalize speed score (0-1, faster = higher score)
      const maxDuration = Math.max(...rankedQuotes.map((q) => q.estimatedDuration));
      const speedScore = 1 - quote.estimatedDuration / maxDuration;

      // Weighted total score
      const totalScore = amountScore * 0.7 + speedScore * 0.3;

      return { quote, score: totalScore };
    });

    // Sort by score and return best
    scoredQuotes.sort((a, b) => b.score - a.score);
    return scoredQuotes[0]!.quote;
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get count of registered providers
   */
  getProviderCount(): number {
    return this.providers.size;
  }
}

// Persist singleton across Next.js hot reloads via globalThis
const globalForProviders = globalThis as unknown as {
  __providerRegistry?: ProviderRegistry;
};

export const providerRegistry = globalForProviders.__providerRegistry ?? new ProviderRegistry();

globalForProviders.__providerRegistry = providerRegistry;
