import axios, { type AxiosInstance } from 'axios';
import {
  API_TIMEOUT_MS,
  DEBRIDGE_API_URL,
  DEFAULT_DEBRIDGE_DURATION_SECS,
  MAX_QUOTE_DRIFT,
  NATIVE_SOL_ADDRESS,
  QUOTE_VALIDITY_MS,
  SOL_MINT,
  SOLANA_BASE_FEE_LAMPORTS,
  SOLANA_CHAIN_ID,
} from '@/lib/config/constants';
import { BridgeError } from '@/lib/errors';
import { solanaService } from '@/lib/solana';
import { logger } from '@/lib/utils/logger';
import { retryApiCall } from '@/lib/utils/retry';
import type {
  BridgeQuote,
  BuildTransactionResult,
  CostBreakdown,
  ExecutionStatus,
  IBridgeProvider,
  QuoteParams,
  QuoteValidation,
  RouteInfo,
  TokenInfo,
} from '@/types/bridge';
import type {
  DeBridgeCreateTxResponse,
  DeBridgeOrderStatusResponse,
  DeBridgeRawQuote,
  DeBridgeTokenListResponse,
} from '@/types/debridge';

export class DeBridgeProvider implements IBridgeProvider {
  name = 'debridge';
  private client: AxiosInstance;
  private tokenCache: Map<string, TokenInfo[]> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: DEBRIDGE_API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: API_TIMEOUT_MS,
    });
  }

  /**
   * Check if DeBridge supports a given route by verifying tokens exist in cached token list.
   * Falls back to true if token list hasn't been fetched yet.
   */
  async supportsRoute(
    params: Pick<QuoteParams, 'sourceToken' | 'destChain' | 'destToken'>,
  ): Promise<boolean> {
    if (!this.tokenCache) {
      try {
        this.tokenCache = await this.fetchSupportedTokens();
      } catch {
        return true;
      }
    }

    const solanaTokens = this.tokenCache.get(SOLANA_CHAIN_ID) || [];
    const destTokens = this.tokenCache.get(params.destChain) || [];

    if (solanaTokens.length === 0 && destTokens.length === 0) {
      return true;
    }

    const sourceForCheck =
      params.sourceToken === SOL_MINT ? NATIVE_SOL_ADDRESS : params.sourceToken;
    const hasSource =
      solanaTokens.length === 0 ||
      solanaTokens.some((t) => t.address?.toLowerCase() === sourceForCheck.toLowerCase());
    const hasDest =
      destTokens.length === 0 ||
      destTokens.some((t) => t.address?.toLowerCase() === params.destToken.toLowerCase());

    return hasSource && hasDest;
  }

  /**
   * Get quote from DeBridge DLN API with retry logic
   * Docs: GET /v1.0/dln/order/create-tx
   */
  async getQuote(params: QuoteParams): Promise<BridgeQuote> {
    return retryApiCall(async () => {
      try {
        // DeBridge uses create-tx endpoint for both quotes and transaction creation.
        // Without srcChainOrderAuthorityAddress, only the estimation is returned (no tx).
        const srcChainTokenIn =
          params.sourceToken === SOL_MINT ? NATIVE_SOL_ADDRESS : params.sourceToken;
        const response = await this.client.get<DeBridgeCreateTxResponse>(
          '/v1.0/dln/order/create-tx',
          {
            params: {
              srcChainId: SOLANA_CHAIN_ID,
              srcChainTokenIn,
              srcChainTokenInAmount: params.sourceAmount,
              dstChainId: params.destChain,
              dstChainTokenOut: params.destToken,
              dstChainTokenOutAmount: 'auto',
              dstChainTokenOutRecipient: params.destWallet,
            },
          },
        );

        const data = response.data;
        const dstOut = data.estimation?.dstChainTokenOut;

        // DeBridge returns usdPriceImpact as negative (e.g. -0.08 = 0.08% loss)
        const priceImpact =
          data.estimation?.usdPriceImpact != null
            ? Math.abs(data.estimation.usdPriceImpact)
            : undefined;

        const quote: BridgeQuote = {
          provider: this.name,
          quoteId: data.orderId || `debridge-${Date.now()}`,
          sourceAmount: params.sourceAmount,
          destAmount: dstOut?.recommendedAmount || dstOut?.amount || '0',
          estimatedDuration:
            data.order?.approximateFulfillmentDelay || DEFAULT_DEBRIDGE_DURATION_SECS,
          validUntil: new Date(Date.now() + QUOTE_VALIDITY_MS),
          route: this.parseRoute(data, params),
          estimatedCosts: await this.estimateCostsFromResponse(data),
          priceImpact,
          rawQuote: {
            ...data,
            // Preserve request params that aren't echoed in response
            dstChainTokenOutRecipient: params.destWallet,
            _requestParams: {
              srcChainTokenIn: params.sourceToken,
              dstChainId: params.destChain,
              dstChainTokenOut: params.destToken,
            },
          },
        };

        return quote;
      } catch (error) {
        logger.error(
          'DeBridge getQuote error:',
          error instanceof Error ? error : { error: String(error) },
        );
        throw new BridgeError('Failed to get quote from DeBridge', this.name, { cause: error });
      }
    }, 'DeBridge.getQuote');
  }

  /**
   * Validate if quote is still valid
   */
  async validateQuote(quote: BridgeQuote): Promise<QuoteValidation> {
    try {
      if (new Date() > quote.validUntil) {
        return {
          isValid: false,
          driftPercentage: 0,
          reason: 'Quote expired',
        };
      }

      const params = this.extractParamsFromQuote(quote);
      const freshQuote = await this.getQuote(params);

      const originalAmount = parseFloat(quote.destAmount);
      const currentAmount = parseFloat(freshQuote.destAmount);
      const drift = Math.abs((currentAmount - originalAmount) / originalAmount);

      return {
        isValid: drift <= MAX_QUOTE_DRIFT,
        driftPercentage: drift,
        currentDestAmount: freshQuote.destAmount,
      };
    } catch (error) {
      logger.error(
        'DeBridge validateQuote error:',
        error instanceof Error ? error : { error: String(error) },
      );
      return {
        isValid: false,
        driftPercentage: 0,
        reason: 'Failed to validate quote',
      };
    }
  }

  /**
   * Build transaction for execution
   * Calls create-tx with authority addresses to get a signable transaction
   */
  async buildTransaction(
    quote: BridgeQuote,
    _sponsor: string,
    userWallet: string,
  ): Promise<BuildTransactionResult> {
    return retryApiCall(async () => {
      try {
        const raw = quote.rawQuote as DeBridgeRawQuote;
        const rawSrcToken =
          raw.estimation?.srcChainTokenIn?.address || raw._requestParams.srcChainTokenIn;
        const srcToken = rawSrcToken === SOL_MINT ? NATIVE_SOL_ADDRESS : rawSrcToken;
        const dstToken =
          raw.estimation?.dstChainTokenOut?.address || raw._requestParams.dstChainTokenOut;
        const dstChainId =
          raw.estimation?.dstChainTokenOut?.chainId?.toString() || raw._requestParams.dstChainId;
        const recipient = raw.dstChainTokenOutRecipient;

        // Request full transaction with authority addresses included
        const response = await this.client.get<DeBridgeCreateTxResponse>(
          '/v1.0/dln/order/create-tx',
          {
            params: {
              srcChainId: SOLANA_CHAIN_ID,
              srcChainTokenIn: srcToken,
              srcChainTokenInAmount: quote.sourceAmount,
              dstChainId: dstChainId,
              dstChainTokenOut: dstToken,
              dstChainTokenOutAmount: 'auto',
              dstChainTokenOutRecipient: recipient,
              srcChainOrderAuthorityAddress: userWallet,
              dstChainOrderAuthorityAddress: recipient,
            },
          },
        );

        const txData = response.data;

        // For Solana source chain, tx.data is a hex-encoded serialized transaction
        if (txData.tx?.data) {
          const hexData = txData.tx.data.startsWith('0x')
            ? txData.tx.data.slice(2)
            : txData.tx.data;
          return {
            transaction: new Uint8Array(Buffer.from(hexData, 'hex')),
            providerId: txData.orderId,
          };
        }

        throw new BridgeError('No transaction data in DeBridge response', this.name);
      } catch (error) {
        logger.error(
          'DeBridge buildTransaction error:',
          error instanceof Error ? error : { error: String(error) },
        );
        throw new BridgeError('Failed to build transaction from DeBridge', this.name, {
          cause: error,
        });
      }
    }, 'DeBridge.buildTransaction');
  }

  /**
   * Get execution status
   * Docs: GET /v1.0/dln/order/{id}
   */
  async getStatus(orderId: string): Promise<ExecutionStatus> {
    return retryApiCall(async () => {
      try {
        const response = await this.client.get<DeBridgeOrderStatusResponse>(
          `/v1.0/dln/order/${orderId}`,
        );
        const data = response.data;

        return {
          status: this.mapDeBridgeStatus(data.status || ''),
          sourceChainTx: data.orderId,
          destChainTx: data.orderStruct?.receiverDst,
          currentStep: data.status,
          error: data.externalCallState === 'Failed' ? 'External call failed' : undefined,
        };
      } catch (error) {
        logger.error(
          'DeBridge getStatus error:',
          error instanceof Error ? error : { error: String(error) },
        );
        throw new BridgeError('Failed to get status from DeBridge', this.name, { cause: error });
      }
    }, 'DeBridge.getStatus');
  }

  /**
   * Estimate costs for the swap by fetching live priority fees from the cluster
   */
  async estimateCosts(_params: QuoteParams): Promise<CostBreakdown> {
    return this.estimateCostsFromResponse(null);
  }

  /**
   * Extract cost estimates from a DeBridge API response when available,
   * otherwise fetch live fees from Solana RPC.
   */
  private async estimateCostsFromResponse(
    data: DeBridgeCreateTxResponse | null,
  ): Promise<CostBreakdown> {
    const feeDetails = data?.estimatedTransactionFee?.details;

    const solanaGasFee = feeDetails?.txFee
      ? parseInt(String(feeDetails.txFee), 10)
      : SOLANA_BASE_FEE_LAMPORTS;
    const solanaPriorityFee = feeDetails?.priorityFee
      ? parseInt(String(feeDetails.priorityFee), 10)
      : await solanaService.getRecentPriorityFee();

    const bridgeFee = data?.fixFee ? parseInt(String(data.fixFee), 10) : 0;

    return {
      solanaGasFee,
      solanaPriorityFee,
      bridgeFee,
      accountRentCost: 0,
      totalSponsorCost: solanaGasFee + solanaPriorityFee,
    };
  }

  /**
   * Parse route information from DeBridge response
   */
  private parseRoute(data: DeBridgeCreateTxResponse, params: QuoteParams): RouteInfo {
    const fulfillmentDelay =
      data.order?.approximateFulfillmentDelay || DEFAULT_DEBRIDGE_DURATION_SECS;

    const steps = [
      {
        protocol: 'debridge-dln',
        fromChain: SOLANA_CHAIN_ID,
        toChain: params.destChain,
        fromToken: params.sourceToken,
        toToken: params.destToken,
        estimatedTime: fulfillmentDelay,
      },
    ];

    // Extract fees from costsDetails if available
    const costsDetails = data.estimation?.costsDetails;
    let totalFees = '0';
    if (costsDetails && costsDetails.length > 0) {
      const feeSum = costsDetails.reduce((sum, cost) => {
        return sum + parseFloat(cost.payload?.feeAmount || '0');
      }, 0);
      totalFees = feeSum.toString();
    } else if (data.protocolFee) {
      totalFees = String(data.protocolFee);
    }

    return {
      steps,
      totalFees,
    };
  }

  /**
   * Map DeBridge order status to standard status
   * Actual API statuses: None, Created, Fulfilled, SentUnlock,
   * OrderCancelled, SentOrderCancel, ClaimedUnlock, ClaimedOrderCancel
   */
  private mapDeBridgeStatus(debridgeStatus: string): ExecutionStatus['status'] {
    const statusMap: Record<string, ExecutionStatus['status']> = {
      None: 'pending',
      Created: 'pending',
      Fulfilled: 'processing',
      SentUnlock: 'processing',
      ClaimedUnlock: 'completed',
      OrderCancelled: 'failed',
      SentOrderCancel: 'failed',
      ClaimedOrderCancel: 'failed',
    };

    return statusMap[debridgeStatus] || 'pending';
  }

  /**
   * Extract quote params from existing quote (for revalidation)
   */
  private extractParamsFromQuote(quote: BridgeQuote): QuoteParams {
    const raw = quote.rawQuote as DeBridgeRawQuote;
    const srcIn = raw.estimation?.srcChainTokenIn;
    const dstOut = raw.estimation?.dstChainTokenOut;

    return {
      sourceChain: 'solana',
      sourceToken: srcIn?.address || raw._requestParams.srcChainTokenIn || '',
      sourceAmount: quote.sourceAmount,
      destChain: dstOut?.chainId?.toString() || raw._requestParams.dstChainId || '',
      destToken: dstOut?.address || raw._requestParams.dstChainTokenOut || '',
      userWallet: raw.srcChainOrderAuthorityAddress || '',
      destWallet: raw.dstChainTokenOutRecipient || '',
    };
  }

  /**
   * Fetch supported tokens from DeBridge for well-known chains.
   * Docs: GET /v1.0/token-list?chainId={chainId}
   * Response: { tokens: { [address]: { symbol, name, decimals, address, logoURI, tags } } }
   */
  async fetchSupportedTokens(): Promise<Map<string, TokenInfo[]>> {
    // DeBridge requires a chainId per request — fetch for common chains in parallel
    const chainIds = [
      SOLANA_CHAIN_ID, // Solana
      '1', // Ethereum
      '10', // Optimism
      '56', // BNB Chain
      '137', // Polygon
      '8453', // Base
      '42161', // Arbitrum
      '43114', // Avalanche
    ];

    const tokens = new Map<string, TokenInfo[]>();

    const results = await Promise.allSettled(
      chainIds.map((chainId) => this.fetchTokensForChain(chainId)),
    );

    for (const [i, result] of results.entries()) {
      const chainId = chainIds[i];
      if (chainId && result.status === 'fulfilled' && result.value.length > 0) {
        tokens.set(chainId, result.value);
      }
    }

    logger.info('Fetched DeBridge tokens', {
      chains: tokens.size,
      totalTokens: Array.from(tokens.values()).reduce((sum, arr) => sum + arr.length, 0),
    });

    this.tokenCache = tokens;
    return tokens;
  }

  /**
   * Fetch tokens for a single chain from DeBridge
   */
  private async fetchTokensForChain(chainId: string): Promise<TokenInfo[]> {
    return retryApiCall(async () => {
      try {
        const response = await this.client.get<DeBridgeTokenListResponse>('/v1.0/token-list', {
          params: { chainId },
        });
        const tokensObj = response.data.tokens;
        if (!tokensObj) return [];

        const result: TokenInfo[] = [];
        for (const [addr, entry] of Object.entries(tokensObj)) {
          result.push({
            address: entry.address || addr,
            symbol: entry.symbol,
            name: entry.name,
            decimals: entry.decimals,
            chainId,
            logoURI: entry.logoURI,
          });
        }
        return result;
      } catch (error) {
        logger.error(
          `Failed to fetch DeBridge tokens for chain ${chainId}`,
          error instanceof Error ? error : { error: String(error) },
        );
        return [];
      }
    }, `DeBridge.fetchTokensForChain(${chainId})`);
  }
}
