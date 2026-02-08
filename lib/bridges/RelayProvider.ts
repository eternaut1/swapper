import {
  address,
  appendTransactionMessageInstructions,
  createNoopSigner,
  createTransactionMessage,
  getTransactionEncoder,
  type Instruction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import axios, { type AxiosInstance } from 'axios';
import {
  API_TIMEOUT_MS,
  DEFAULT_RELAY_DURATION_SECS,
  MAX_QUOTE_DRIFT,
  NATIVE_SOL_ADDRESS,
  QUOTE_VALIDITY_MS,
  RELAY_API_URL,
  RELAY_SOLANA_CHAIN_ID,
  SOL_MINT,
  SOLANA_BASE_FEE_LAMPORTS,
  SOLANA_CHAIN_ID,
} from '@/lib/config/constants';
import { env } from '@/lib/config/env';
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
  RelayChainsResponse,
  RelayInstruction,
  RelayQuoteResponse,
  RelayRawQuote,
  RelayStatusResponse,
} from '@/types/relay';

export class RelayProvider implements IBridgeProvider {
  name = 'relay';
  private client: AxiosInstance;
  private tokenCache: Map<string, TokenInfo[]> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: RELAY_API_URL,
      headers: {
        'Content-Type': 'application/json',
        ...(env.RELAY_API_KEY && {
          'x-api-key': env.RELAY_API_KEY,
        }),
      },
      timeout: API_TIMEOUT_MS,
    });
  }

  /**
   * Check if Relay supports a given route by verifying tokens exist in cached token list.
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
   * Get quote from Relay v2 API
   */
  async getQuote(params: QuoteParams): Promise<BridgeQuote> {
    return retryApiCall(async () => {
      try {
        const originCurrency =
          params.sourceToken === SOL_MINT ? NATIVE_SOL_ADDRESS : params.sourceToken;
        const response = await this.client.post<RelayQuoteResponse>('/quote/v2', {
          user: params.userWallet,
          originChainId: RELAY_SOLANA_CHAIN_ID,
          destinationChainId: parseInt(params.destChain, 10),
          originCurrency,
          destinationCurrency: params.destToken,
          amount: params.sourceAmount,
          tradeType: 'EXACT_INPUT',
          recipient: params.destWallet,
        });

        const data = response.data;
        const firstStep = data.steps?.[0];
        const requestId = firstStep?.requestId || `relay-${Date.now()}`;
        const destAmount = data.details?.currencyOut?.amount || '0';
        const timeEstimate = data.details?.timeEstimate || DEFAULT_RELAY_DURATION_SECS;

        // Relay returns swapImpact.percent as a string (e.g. "-0.08")
        const rawImpact = data.details?.swapImpact?.percent;
        const priceImpact = rawImpact != null ? Math.abs(parseFloat(rawImpact)) : undefined;

        const quote: BridgeQuote = {
          provider: this.name,
          quoteId: requestId,
          sourceAmount: params.sourceAmount,
          destAmount,
          estimatedDuration: timeEstimate,
          validUntil: new Date(Date.now() + QUOTE_VALIDITY_MS),
          route: this.parseRoute(data, params),
          estimatedCosts: await this.estimateCosts(params),
          priceImpact,
          rawQuote: {
            ...data,
            _requestParams: {
              originCurrency: params.sourceToken,
              destinationCurrency: params.destToken,
              originChainId: RELAY_SOLANA_CHAIN_ID,
              destinationChainId: parseInt(params.destChain, 10),
              user: params.userWallet,
              recipient: params.destWallet,
            },
          },
        };

        return quote;
      } catch (error) {
        logger.error(
          'Relay getQuote error:',
          error instanceof Error ? error : { error: String(error) },
        );
        throw new BridgeError('Failed to get quote from Relay', this.name, { cause: error });
      }
    }, 'Relay.getQuote');
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
        'Relay validateQuote error:',
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
   * Build transaction from the Relay v2 quote response.
   * The v2 API returns Solana instructions directly in the quote.
   */
  async buildTransaction(
    quote: BridgeQuote,
    _sponsor: string,
    userWallet: string,
  ): Promise<BuildTransactionResult> {
    return retryApiCall(async () => {
      try {
        const raw = quote.rawQuote as RelayRawQuote;
        const firstStep = raw.steps?.[0];
        const firstItem = firstStep?.items?.[0];
        const rawInstructions = firstItem?.data?.instructions;

        if (!rawInstructions || rawInstructions.length === 0) {
          throw new BridgeError('No instructions found in Relay quote response', this.name);
        }

        const instructions = this.convertRelayInstructions(rawInstructions);

        const { blockhash, lastValidBlockHeight } = await solanaService.getRecentBlockhash();
        const userSigner = createNoopSigner(address(userWallet));

        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayerSigner(userSigner, m),
          (m) =>
            setTransactionMessageLifetimeUsingBlockhash({ blockhash, lastValidBlockHeight }, m),
          (m) => appendTransactionMessageInstructions(instructions, m),
        );

        const signed = await partiallySignTransactionMessageWithSigners(message);
        return {
          transaction: new Uint8Array(getTransactionEncoder().encode(signed)),
        };
      } catch (error) {
        logger.error(
          'Relay buildTransaction error:',
          error instanceof Error ? error : { error: String(error) },
        );
        throw new BridgeError('Failed to build transaction from Relay', this.name, {
          cause: error,
        });
      }
    }, 'Relay.buildTransaction');
  }

  /**
   * Convert Relay v2 instruction format to @solana/kit Instruction format
   */
  private convertRelayInstructions(rawInstructions: RelayInstruction[]): Instruction[] {
    // AccountRole: READONLY=0, WRITABLE=1, READONLY_SIGNER=2, WRITABLE_SIGNER=3
    return rawInstructions.map((ix) => {
      const accounts = (ix.keys || []).map((key) => {
        let role: number;
        if (key.isSigner && key.isWritable) role = 3;
        else if (key.isSigner) role = 2;
        else if (key.isWritable) role = 1;
        else role = 0;

        return {
          address: address(key.pubkey || ''),
          role: role as 0 | 1 | 2 | 3,
        };
      });

      return {
        programAddress: address(ix.programId || ''),
        accounts,
        ...(ix.data ? { data: new Uint8Array(Buffer.from(ix.data, 'hex')) } : {}),
      } as Instruction;
    });
  }

  /**
   * Get execution status via v3 endpoint
   */
  async getStatus(orderId: string): Promise<ExecutionStatus> {
    return retryApiCall(async () => {
      try {
        const response = await this.client.get<RelayStatusResponse>('/intents/status/v3', {
          params: { requestId: orderId },
        });
        const data = response.data;

        return {
          status: this.mapRelayStatus(data.status || ''),
          sourceChainTx: data.originTxHash || data.inTxHash || '',
          destChainTx: data.destinationTxHash || data.outTxHash || '',
          currentStep: data.step || data.status || '',
          estimatedCompletion: undefined,
          error: data.error || data.message || undefined,
        };
      } catch (error) {
        logger.error(
          'Relay getStatus error:',
          error instanceof Error ? error : { error: String(error) },
        );
        throw new BridgeError('Failed to get status from Relay', this.name, { cause: error });
      }
    }, 'Relay.getStatus');
  }

  /**
   * Estimate costs for the swap by fetching live priority fees from the cluster
   */
  async estimateCosts(_params: QuoteParams): Promise<CostBreakdown> {
    const solanaGasFee = SOLANA_BASE_FEE_LAMPORTS;
    const solanaPriorityFee = await solanaService.getRecentPriorityFee();

    return {
      solanaGasFee,
      solanaPriorityFee,
      bridgeFee: 0,
      accountRentCost: 0,
      totalSponsorCost: solanaGasFee + solanaPriorityFee,
    };
  }

  /**
   * Parse route information from Relay v2 response
   */
  private parseRoute(data: RelayQuoteResponse, params: QuoteParams): RouteInfo {
    const totalFees = data.fees?.relayer?.amount || '0';

    return {
      steps: [
        {
          protocol: 'relay',
          fromChain: String(RELAY_SOLANA_CHAIN_ID),
          toChain: params.destChain,
          fromToken: params.sourceToken,
          toToken: params.destToken,
          estimatedTime: data.details?.timeEstimate || DEFAULT_RELAY_DURATION_SECS,
        },
      ],
      totalFees,
    };
  }

  /**
   * Map Relay status to standard status
   */
  private mapRelayStatus(relayStatus: string): ExecutionStatus['status'] {
    const statusMap: Record<string, ExecutionStatus['status']> = {
      pending: 'pending',
      waiting: 'pending',
      processing: 'processing',
      delayed: 'processing',
      completed: 'completed',
      success: 'completed',
      failed: 'failed',
      error: 'failed',
      refunded: 'failed',
    };

    return statusMap[relayStatus.toLowerCase()] || 'pending';
  }

  /**
   * Extract quote params from existing quote (for revalidation)
   */
  private extractParamsFromQuote(quote: BridgeQuote): QuoteParams {
    const raw = quote.rawQuote as RelayRawQuote;
    const rp = raw._requestParams;

    return {
      sourceChain: 'solana',
      sourceToken: rp.originCurrency || '',
      sourceAmount: quote.sourceAmount,
      destChain: String(rp.destinationChainId || ''),
      destToken: rp.destinationCurrency || '',
      userWallet: rp.user || '',
      destWallet: rp.recipient || '',
    };
  }

  /**
   * Fetch supported tokens/currencies from Relay.
   * Docs: GET /chains — returns all chains with native currency + erc20Currencies
   */
  async fetchSupportedTokens(): Promise<Map<string, TokenInfo[]>> {
    return retryApiCall(async () => {
      try {
        const response = await this.client.get<RelayChainsResponse>('/chains');
        const tokens = new Map<string, TokenInfo[]>();
        const chains = response.data.chains;

        if (!Array.isArray(chains)) return tokens;

        for (const chain of chains) {
          const chainId = chain.id?.toString();
          if (!chainId) continue;
          if (chain.disabled === true) continue;

          const chainTokens: TokenInfo[] = [];

          // Add native currency
          const native = chain.currency;
          if (native && native.supportsBridging !== false) {
            chainTokens.push({
              address: native.address || '',
              symbol: native.symbol,
              name: native.name,
              decimals: native.decimals,
              chainId,
            });
          }

          // Add ERC-20 / SPL currencies
          if (Array.isArray(chain.erc20Currencies)) {
            for (const t of chain.erc20Currencies) {
              if (t.supportsBridging === false) continue;
              chainTokens.push({
                address: t.address || '',
                symbol: t.symbol,
                name: t.name,
                decimals: t.decimals,
                chainId,
              });
            }
          }

          if (chainTokens.length > 0) {
            tokens.set(chainId, chainTokens);
          }
        }

        logger.info('Fetched Relay tokens', {
          chains: tokens.size,
          totalTokens: Array.from(tokens.values()).reduce((sum, arr) => sum + arr.length, 0),
        });

        this.tokenCache = tokens;
        return tokens;
      } catch (error) {
        logger.error(
          'Failed to fetch Relay tokens',
          error instanceof Error ? error : { error: String(error) },
        );
        return new Map();
      }
    }, 'Relay.fetchSupportedTokens');
  }
}
