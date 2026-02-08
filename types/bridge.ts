import type { DeBridgeRawQuote } from './debridge';
import type { RelayRawQuote } from './relay';

export interface IBridgeProvider {
  name: string;

  // Check if provider supports a given source/dest chain+token pair
  supportsRoute(
    params: Pick<QuoteParams, 'sourceToken' | 'destChain' | 'destToken'>,
  ): Promise<boolean>;

  // Get quote from bridge provider
  getQuote(params: QuoteParams): Promise<BridgeQuote>;

  // Validate quote is still valid (price drift check)
  validateQuote(quote: BridgeQuote): Promise<QuoteValidation>;

  // Build Solana transaction with sponsorship
  buildTransaction(
    quote: BridgeQuote,
    sponsor: string,
    userWallet: string,
  ): Promise<BuildTransactionResult>;

  // Get execution status
  getStatus(orderId: string): Promise<ExecutionStatus>;

  // Estimate all costs (Solana gas, bridge fees, etc.)
  estimateCosts(params: QuoteParams): Promise<CostBreakdown>;
}

export interface QuoteParams {
  sourceChain: 'solana';
  sourceToken: string; // SPL token address
  sourceAmount: string;
  destChain: string; // EVM chain ID
  destToken: string; // EVM token address
  userWallet: string; // Solana wallet
  destWallet: string; // EVM destination wallet
}

export interface BridgeQuote {
  provider: string;
  quoteId: string;
  sourceAmount: string;
  destAmount: string;
  estimatedDuration: number;
  validUntil: Date;
  route: RouteInfo;
  estimatedCosts: CostBreakdown;
  rawQuote: DeBridgeRawQuote | RelayRawQuote;
}

/** Token info returned by bridge provider token-list endpoints */
export interface TokenInfo {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  chainId: string;
  logoURI?: string;
}

export interface RouteInfo {
  steps: RouteStep[];
  totalFees: string;
}

export interface RouteStep {
  protocol: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  estimatedTime: number;
}

export interface CostBreakdown {
  solanaGasFee: number; // in lamports
  solanaPriorityFee: number; // in lamports
  bridgeFee: number; // in source token units
  transferFee?: number; // Token-2022 transfer fee
  accountRentCost?: number; // for creating accounts
  totalSponsorCost: number; // total sponsor must pay in SOL
  userFeeUsdc?: number; // calculated user fee in USDC
  userFeeSol?: number; // calculated user fee in SOL
}

export interface QuoteValidation {
  isValid: boolean;
  driftPercentage: number;
  currentDestAmount?: string;
  reason?: string;
}

export interface BuildTransactionResult {
  transaction: Uint8Array;
  providerId?: string; // Real provider order ID (e.g. DeBridge 0x-prefixed hash)
}

export interface ExecutionStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  sourceChainTx?: string;
  destChainTx?: string;
  currentStep?: string;
  estimatedCompletion?: Date;
  error?: string;
}

export interface ProviderResult {
  provider: string;
  status: 'success' | 'no_route' | 'error';
  error?: string;
}

export interface AggregatedQuotes {
  quotes: BridgeQuote[];
  bestQuote: BridgeQuote; // highest destAmount, accounting for fees
  recommendedQuote: BridgeQuote; // best considering speed + amount
  providerResults: ProviderResult[];
}
