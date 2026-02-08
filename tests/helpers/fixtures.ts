/**
 * Test fixtures and factories for E2E tests
 * Provides realistic test data and helper functions
 */

import type { KeyPairSigner } from '@solana/kit';
import bs58 from 'bs58';
import { randomUUID } from 'crypto';

/**
 * Generate a valid Solana public key (for testing)
 */
export function generateSolanaAddress(): string {
  // Returns a valid-looking base58 string for test purposes
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a valid Ethereum address (for testing)
 */
export function generateEthereumAddress(): string {
  const hex = '0123456789abcdef';
  let result = '0x';
  for (let i = 0; i < 40; i++) {
    result += hex.charAt(Math.floor(Math.random() * hex.length));
  }
  return result;
}

/**
 * Common token addresses for testing
 */
export const TestTokens = {
  solana: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
  ethereum: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  polygon: {
    MATIC: '0x0000000000000000000000000000000000001010',
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  },
  arbitrum: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  },
};

/**
 * Valid chain IDs for testing
 */
export const TestChains = {
  solana: 'solana',
  ethereum: '1',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
};

/**
 * Create a mock quote request
 */
interface QuoteRequest {
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  destChain: string;
  destToken: string;
  userWallet: string;
  destWallet: string;
}

export function getTestUserWallet(): string | undefined {
  const key = process.env['TEST_USER_PRIVATE_KEY'];
  if (!key) return undefined;
  // Solana keypair is 64 bytes: [32 secret][32 public]. Derive address from public half.
  const decoded = bs58.decode(key);
  return bs58.encode(decoded.slice(32, 64));
}

export function createQuoteRequest(overrides?: Partial<QuoteRequest>): QuoteRequest {
  const userWallet = getTestUserWallet() || generateSolanaAddress();
  const destWallet = process.env['TEST_DEST_WALLET'] || generateEthereumAddress();

  const defaults = {
    sourceChain: TestChains.solana,
    sourceToken: TestTokens.solana.USDC,
    sourceAmount: '1', // 1 USDC — API converts human-readable to base units
    destChain: TestChains.arbitrum,
    destToken: TestTokens.arbitrum.USDC,
    userWallet,
    destWallet,
  };

  return { ...defaults, ...overrides };
}

/**
 * Create a mock quote response
 */
interface QuoteResponse {
  provider: string;
  quoteId: string;
  sourceAmount: string;
  destAmount: string;
  estimatedDuration: number;
  validUntil: string;
  route: {
    steps: Array<{
      protocol: string;
      fromChain: string;
      toChain: string;
      fromToken: string;
      toToken: string;
      estimatedTime: number;
    }>;
    totalFees: string;
  };
  estimatedCosts: {
    solanaGasFee: number;
    solanaPriorityFee: number;
    bridgeFee: number;
    accountRentCost: number;
    totalSponsorCost: number;
    userFeeUsdc: string;
    userFeeSol: string;
  };
  rawQuote: Record<string, unknown>;
}

export function createQuoteResponse(overrides?: Partial<QuoteResponse>): QuoteResponse {
  const defaults = {
    provider: 'relay',
    quoteId: `quote-${randomUUID()}`,
    sourceAmount: '1000000',
    destAmount: '990000', // Account for fees
    estimatedDuration: 300,
    validUntil: new Date(Date.now() + 30000).toISOString(),
    route: {
      steps: [
        {
          protocol: 'relay',
          fromChain: 'solana',
          toChain: '42161',
          fromToken: TestTokens.solana.USDC,
          toToken: TestTokens.arbitrum.USDC,
          estimatedTime: 300,
        },
      ],
      totalFees: '10000',
    },
    estimatedCosts: {
      solanaGasFee: 5000,
      solanaPriorityFee: 10000,
      bridgeFee: 0,
      accountRentCost: 0,
      totalSponsorCost: 15000,
      userFeeUsdc: '0.015',
      userFeeSol: '0.000015',
    },
    rawQuote: {
      id: `quote-${randomUUID()}`,
      originCurrency: TestTokens.solana.USDC,
      destinationCurrency: TestTokens.arbitrum.USDC,
      destinationChainId: '42161',
      toAmount: '990000',
      user: generateSolanaAddress(),
      recipient: generateEthereumAddress(),
    },
  };

  return { ...defaults, ...overrides };
}

/**
 * Create mock swap data
 */
interface SwapData {
  id: string;
  userWallet: string;
  destWallet: string;
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  destChain: string;
  destToken: string;
  destAmount: string;
  provider: string;
  providerId: string;
  quoteId: string;
  status: string;
  userFeeToken: string;
  userFeeAmount: string;
  sponsorCostsSol: string;
  estimatedDuration: number;
  createdAt: Date;
  updatedAt: Date;
}

export function createSwapData(overrides?: Partial<SwapData>): SwapData {
  const defaults = {
    id: randomUUID(),
    userWallet: generateSolanaAddress(),
    destWallet: generateEthereumAddress(),
    sourceChain: 'solana',
    sourceToken: TestTokens.solana.USDC,
    sourceAmount: '1000000',
    destChain: '42161',
    destToken: TestTokens.arbitrum.USDC,
    destAmount: '990000',
    provider: 'relay',
    providerId: `relay-${randomUUID()}`,
    quoteId: `quote-${randomUUID()}`,
    status: 'PENDING',
    userFeeToken: 'USDC',
    userFeeAmount: '15000',
    sponsorCostsSol: '15000',
    estimatedDuration: 300,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { ...defaults, ...overrides };
}

/**
 * Mock external API responses
 */
export const MockApiResponses = {
  relay: {
    quote: {
      id: 'relay-quote-123',
      toAmount: '990000',
      destinationAmount: '990000',
      estimatedTime: 300,
      destinationChainId: '1',
      originCurrency: TestTokens.solana.USDC,
      destinationCurrency: TestTokens.ethereum.USDC,
    },
    execute: {
      transaction: Buffer.from('mock-transaction-data').toString('base64'),
    },
    status: {
      status: 'completed',
      originTxHash: `0x${'1'.repeat(64)}`,
      destinationTxHash: `0x${'2'.repeat(64)}`,
      step: 'completed',
    },
  },
  debridge: {
    quote: {
      orderId: 'debridge-order-123',
      estimation: {
        dstChainTokenOut: {
          amount: '990000',
        },
        approximateFulfillmentDelay: 180,
      },
      srcChainTokenIn: TestTokens.solana.USDC,
      dstChainId: '1',
      dstChainTokenOut: TestTokens.arbitrum.USDC,
    },
    execute: {
      tx: {
        data: Buffer.from('mock-transaction-data').toString('hex'),
      },
    },
    status: {
      status: 'OrderFulfilled',
      orderId: 'debridge-order-123',
      creationTransactionHash: `0x${'1'.repeat(64)}`,
      fulfillTransactionHash: `0x${'2'.repeat(64)}`,
    },
  },
};

/**
 * Test wallet signer (cached)
 * Requires TEST_USER_PRIVATE_KEY env var (base58-encoded Solana keypair)
 */
let _testSigner: KeyPairSigner | null = null;

export async function getTestSigner(): Promise<KeyPairSigner> {
  if (_testSigner) return _testSigner;
  const key = process.env['TEST_USER_PRIVATE_KEY'];
  if (!key) throw new Error('TEST_USER_PRIVATE_KEY env var not set');
  const { createKeyPairSignerFromBytes } = await import('@solana/kit');
  const bs58 = (await import('bs58')).default;
  _testSigner = await createKeyPairSignerFromBytes(bs58.decode(key));
  return _testSigner;
}

/**
 * Sign a partially-signed transaction (base64) with the test user's private key.
 * Returns the fully-signed transaction as base64.
 */
export async function signTestTransaction(base64Tx: string): Promise<string> {
  const { getTransactionDecoder } = await import('@solana/kit');
  const signer = await getTestSigner();
  const txBytes = new Uint8Array(Buffer.from(base64Tx, 'base64'));

  // Decode transaction to extract message bytes and signer positions
  const decoded = getTransactionDecoder().decode(txBytes);

  // Sign the message bytes using the signer's CryptoKey
  const signatureBuffer = await crypto.subtle.sign(
    'Ed25519',
    signer.keyPair.privateKey,
    decoded.messageBytes,
  );
  const signature = new Uint8Array(signatureBuffer);

  // Find user's index in the signatures array and insert the signature
  const signerAddresses = Object.keys(decoded.signatures);
  const userIndex = signerAddresses.indexOf(signer.address);
  if (userIndex === -1) {
    throw new Error(`Test user ${signer.address} not found in transaction signers`);
  }

  // Wire format: [compact-u16 numSigs] [sig0 64B] [sig1 64B] ... [message]
  const result = new Uint8Array(txBytes);
  const sigOffset = 1 + userIndex * 64;
  result.set(signature.slice(0, 64), sigOffset);

  return Buffer.from(result).toString('base64');
}

/**
 * Delay helper for async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry helper for flaky operations
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { maxAttempts = 10, delayMs = 1000, timeoutMs = 30000 } = options;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout after ${timeoutMs}ms`);
    }

    const result = await fn();
    if (condition(result)) {
      return result;
    }

    if (attempt < maxAttempts) {
      await delay(delayMs);
    }
  }

  throw new Error(`Condition not met after ${maxAttempts} attempts`);
}

/**
 * Clean test data patterns
 */
export const CleanPatterns = {
  /**
   * Valid amounts for different token decimals
   */
  amounts: {
    usdc: '1000000', // 1 USDC (6 decimals)
    usdt: '1000000', // 1 USDT (6 decimals)
    sol: '1000000000', // 1 SOL (9 decimals)
    eth: '1000000000000000000', // 1 ETH (18 decimals)
  },

  /**
   * Realistic fee ranges
   */
  fees: {
    solanaGas: { min: 5000, max: 10000 }, // 0.000005 - 0.00001 SOL
    solanaPriority: { min: 10000, max: 50000 }, // 0.00001 - 0.00005 SOL
    bridgeFeeBps: { min: 5, max: 50 }, // 0.05% - 0.5%
  },

  /**
   * Timing expectations
   */
  timing: {
    quoteGeneration: { min: 100, max: 5000 }, // 100ms - 5s
    swapExecution: { min: 30000, max: 600000 }, // 30s - 10min
    bridgeCompletion: { min: 60000, max: 1800000 }, // 1min - 30min
  },
};
