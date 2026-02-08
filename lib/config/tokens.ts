import { logger } from '@/lib/utils/logger';
import type { TokenInfo } from '@/types/bridge';

export interface TokenConfig {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: string;
  logoURI?: string;
  isNative?: boolean;
}

/** Convert provider TokenInfo (optional fields) to TokenConfig (required fields) */
function toTokenConfigMap(tokens: Map<string, TokenInfo[]>): Map<string, TokenConfig[]> {
  const result = new Map<string, TokenConfig[]>();
  for (const [chainId, infos] of tokens) {
    result.set(
      chainId,
      infos.map((t) => ({
        address: t.address,
        symbol: t.symbol || 'UNKNOWN',
        name: t.name || t.symbol || 'Unknown Token',
        decimals: t.decimals ?? 18,
        chainId: t.chainId,
        logoURI: t.logoURI,
      })),
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Singleton cache — persisted on globalThis to survive Next.js hot reloads
// ---------------------------------------------------------------------------

interface TokenCacheState {
  tokens: Map<string, TokenConfig[]>;
  lastFetchTime: number;
  /** In-flight fetch promise — prevents concurrent duplicate fetches */
  pendingFetch: Promise<void> | null;
}

const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const globalForTokens = globalThis as unknown as {
  __tokenCache?: TokenCacheState;
};

function getCache(): TokenCacheState {
  if (!globalForTokens.__tokenCache) {
    globalForTokens.__tokenCache = {
      tokens: new Map(),
      lastFetchTime: 0,
      pendingFetch: null,
    };
  }
  return globalForTokens.__tokenCache;
}

// ---------------------------------------------------------------------------
// Fetch + merge logic
// ---------------------------------------------------------------------------

/**
 * Fetches supported tokens from all bridge providers dynamically.
 * Only one fetch runs at a time — concurrent callers share the same promise.
 */
export async function fetchSupportedTokens(): Promise<void> {
  const cache = getCache();

  // If a fetch is already in progress, wait for it instead of starting another
  if (cache.pendingFetch) {
    await cache.pendingFetch;
    return;
  }

  const doFetch = async () => {
    try {
      logger.info('Fetching supported tokens from providers...');

      // Fetch from both providers in parallel
      const [relayTokens, debridgeTokens] = await Promise.all([
        fetchRelayTokens(),
        fetchDeBridgeTokens(),
      ]);

      // Merge and deduplicate tokens
      const mergedTokens = mergeTokenLists([relayTokens, debridgeTokens]);

      // Update cache
      cache.tokens = mergedTokens;
      cache.lastFetchTime = Date.now();

      logger.info(
        `Loaded ${Array.from(cache.tokens.values()).flat().length} tokens across ${cache.tokens.size} chains`,
      );
    } catch (error) {
      logger.error(
        'Failed to fetch supported tokens:',
        error instanceof Error ? error : { error: String(error) },
      );
      // Keep existing cache on error
    } finally {
      cache.pendingFetch = null;
    }
  };

  cache.pendingFetch = doFetch();
  await cache.pendingFetch;
}

/**
 * Fetch supported tokens from Relay API
 */
async function fetchRelayTokens(): Promise<Map<string, TokenConfig[]>> {
  try {
    const { RelayProvider } = await import('@/lib/bridges/RelayProvider');
    const relayProvider = new RelayProvider();
    const tokens = await relayProvider.fetchSupportedTokens();

    logger.info('Relay tokens fetched successfully', {
      chains: tokens.size,
      totalTokens: Array.from(tokens.values()).reduce((sum, arr) => sum + arr.length, 0),
    });

    return toTokenConfigMap(tokens);
  } catch (error) {
    logger.error(
      'Failed to fetch Relay tokens',
      error instanceof Error ? error : { error: String(error) },
    );
    return new Map<string, TokenConfig[]>();
  }
}

/**
 * Fetch supported tokens from DeBridge API
 */
async function fetchDeBridgeTokens(): Promise<Map<string, TokenConfig[]>> {
  try {
    const { DeBridgeProvider } = await import('@/lib/bridges/DeBridgeProvider');
    const debridgeProvider = new DeBridgeProvider();
    const tokens = await debridgeProvider.fetchSupportedTokens();

    logger.info('DeBridge tokens fetched successfully', {
      chains: tokens.size,
      totalTokens: Array.from(tokens.values()).reduce((sum, arr) => sum + arr.length, 0),
    });

    return toTokenConfigMap(tokens);
  } catch (error) {
    logger.error(
      'Failed to fetch DeBridge tokens',
      error instanceof Error ? error : { error: String(error) },
    );
    return new Map<string, TokenConfig[]>();
  }
}

/**
 * Merge token lists from multiple providers
 * Deduplicates tokens by chainId + address
 */
function mergeTokenLists(tokenLists: Map<string, TokenConfig[]>[]): Map<string, TokenConfig[]> {
  const merged = new Map<string, TokenConfig[]>();

  for (const tokenList of tokenLists) {
    for (const [chainId, tokens] of tokenList.entries()) {
      const existing = merged.get(chainId) || [];

      for (const token of tokens) {
        const match = existing.find((t) => t.address.toLowerCase() === token.address.toLowerCase());

        if (match) {
          // Fill in missing fields from the duplicate (e.g. logoURI)
          if (!match.logoURI && token.logoURI) {
            match.logoURI = token.logoURI;
          }
        } else {
          existing.push(token);
        }
      }

      merged.set(chainId, existing);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the cache is populated — call once at startup or lazily on first use.
 * Concurrent calls are safe (only one fetch runs).
 */
async function ensureCache(): Promise<Map<string, TokenConfig[]>> {
  const cache = getCache();
  if (Date.now() - cache.lastFetchTime > CACHE_TTL) {
    await fetchSupportedTokens();
  }
  return cache.tokens;
}

/**
 * Get tokens for a specific chain
 */
export async function getTokensForChain(chainId: string): Promise<TokenConfig[]> {
  const tokens = await ensureCache();
  return tokens.get(chainId) || [];
}

/**
 * Find a specific token by chain ID and address
 */
export async function findToken(
  chainId: string,
  address: string,
): Promise<TokenConfig | undefined> {
  const tokens = await getTokensForChain(chainId);
  return tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

/**
 * Get all supported chains with tokens
 */
export async function getSupportedChains(): Promise<string[]> {
  const tokens = await ensureCache();
  return Array.from(tokens.keys());
}

/**
 * Check if a token is supported
 */
export async function isTokenSupported(chainId: string, address: string): Promise<boolean> {
  const token = await findToken(chainId, address);
  return !!token;
}

// Common Solana token addresses for fallback
export const COMMON_SOLANA_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

/**
 * Hardcoded Solana token configs for instant balance loading.
 * Used when the full provider token cache hasn't warmed up yet,
 * so the balance API never blocks on external API calls.
 */
const SOLANA_CHAIN = '7565164';
const KNOWN_SOLANA_TOKEN_CONFIGS: TokenConfig[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    chainId: SOLANA_CHAIN,
    isNative: true,
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    chainId: SOLANA_CHAIN,
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    chainId: SOLANA_CHAIN,
  },
  {
    address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    symbol: 'JitoSOL',
    name: 'Jito Staked SOL',
    decimals: 9,
    chainId: SOLANA_CHAIN,
  },
  {
    address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade Staked SOL',
    decimals: 9,
    chainId: SOLANA_CHAIN,
  },
  {
    address: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
    symbol: 'bSOL',
    name: 'BlazeStake Staked SOL',
    decimals: 9,
    chainId: SOLANA_CHAIN,
  },
];

/**
 * Get tokens for a chain without blocking on external API fetches.
 * Returns cached data if warm, otherwise hardcoded Solana tokens.
 * Triggers a background cache refresh if the cache is stale.
 */
export function getTokensForChainFast(chainId: string): TokenConfig[] {
  const cache = getCache();

  // Kick off background refresh if stale (don't await)
  if (Date.now() - cache.lastFetchTime > CACHE_TTL && !cache.pendingFetch) {
    fetchSupportedTokens();
  }

  // Return cached data if we have any
  const cached = cache.tokens.get(chainId);
  if (cached && cached.length > 0) {
    return cached;
  }

  // For Solana, return known defaults so balances work instantly
  if (chainId === SOLANA_CHAIN) {
    return KNOWN_SOLANA_TOKEN_CONFIGS;
  }

  return [];
}
