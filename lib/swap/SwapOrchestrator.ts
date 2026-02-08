import 'server-only';
import { SwapStatus as PrismaSwapStatus } from '@prisma/client';
import { createKeyPairSignerFromBytes, type KeyPairSigner } from '@solana/kit';
import bs58 from 'bs58';
import { DeBridgeProvider } from '@/lib/bridges/DeBridgeProvider';
import { providerRegistry } from '@/lib/bridges/ProviderRegistry';
import { RelayProvider } from '@/lib/bridges/RelayProvider';
import {
  DEBRIDGE_ORDER_RENT_LAMPORTS,
  MONITOR_MAX_ATTEMPTS,
  MONITOR_POLL_INTERVAL_MS,
  QUOTE_EXPIRY_SECONDS,
  SOLANA_BASE_FEE_LAMPORTS,
} from '@/lib/config/constants';
import { env } from '@/lib/config/env';
import { type CreateSwapData, swapRepository } from '@/lib/db/swaps';
import {
  AppError,
  BridgeError,
  ConfigError,
  EconomicValidationError,
  InsufficientBalanceError,
  NotFoundError,
  QuoteDriftError,
  QuoteExpiredError,
  TransactionValidationError,
} from '@/lib/errors';
import { feeCalculator, feeValidator } from '@/lib/fees';
import { solanaService } from '@/lib/solana';
import { transactionBuilder } from '@/lib/transactions';
import { formatTokenAmount } from '@/lib/utils/format';
import { logger } from '@/lib/utils/logger';
import type { AggregatedQuotes, BridgeQuote, CostBreakdown, QuoteParams } from '@/types/bridge';
import type { DeBridgeRawQuote } from '@/types/debridge';
import type { RelayRawQuote } from '@/types/relay';
import type { ExecutionResult, PreparedSwap, SwapStatus, UserFee } from '@/types/swap';

interface PendingSwap {
  createData: CreateSwapData;
  validUntil: Date;
}

export class SwapOrchestrator {
  private sponsorSigner: KeyPairSigner;
  private activeMonitors: Map<string, AbortController> = new Map();
  private pendingSwaps: Map<string, PendingSwap> = new Map();

  private constructor(sponsorSigner: KeyPairSigner) {
    this.sponsorSigner = sponsorSigner;
    logger.info('Swap orchestrator initialized', {
      sponsorPublicKey: this.sponsorSigner.address,
    });
  }

  static async create(sponsorPrivateKey: string): Promise<SwapOrchestrator> {
    const decoded = bs58.decode(sponsorPrivateKey);
    const signer = await createKeyPairSignerFromBytes(decoded);
    return new SwapOrchestrator(signer);
  }

  /**
   * Get aggregated quotes from all providers
   */
  async getAggregatedQuotes(params: QuoteParams): Promise<AggregatedQuotes> {
    try {
      // Validate token balances first
      const balanceCheck = await solanaService.validateBalance(
        params.userWallet,
        params.sourceToken,
        BigInt(params.sourceAmount),
      );

      if (!balanceCheck.sufficient) {
        const { decimals } = balanceCheck;
        throw new InsufficientBalanceError(
          formatTokenAmount(String(balanceCheck.requiredBalance), decimals),
          formatTokenAmount(String(balanceCheck.currentBalance), decimals),
        );
      }

      // Get quotes from all providers
      const quotes = await providerRegistry.getAggregatedQuotes(params);

      // Calculate fees for each quote (use sponsored cost estimate for display)
      for (const quote of quotes.quotes) {
        const adjustedCosts = this.adjustCostsForSponsoredMode(quote.estimatedCosts);
        const fees = await feeCalculator.calculateMinimumFee(adjustedCosts);
        quote.estimatedCosts.userFeeUsdc = fees.feeInUsdc;
        quote.estimatedCosts.userFeeSol = fees.feeInSol;
      }

      return quotes;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error(
        'Failed to get aggregated quotes',
        error instanceof Error ? error : { error: String(error) },
      );
      throw new BridgeError('Failed to get quotes', 'aggregator', { cause: error });
    }
  }

  /**
   * Adjust cost breakdown for sponsored mode (2 signatures instead of 1)
   */
  private adjustCostsForSponsoredMode(
    costs: CostBreakdown,
    solAdvanceLamports: number = 0,
  ): CostBreakdown {
    const adjustedGasFee = SOLANA_BASE_FEE_LAMPORTS * 2;
    return {
      ...costs,
      solanaGasFee: adjustedGasFee,
      totalSponsorCost:
        adjustedGasFee +
        costs.solanaPriorityFee +
        (costs.accountRentCost || 0) +
        solAdvanceLamports,
    };
  }

  /**
   * Prepare swap for execution.
   * Builds transaction and calculates final fees.
   * Does NOT persist to DB — record is created only after user signs (in executeSwap).
   */
  async prepareSwap(
    quote: BridgeQuote,
    userWallet: string,
    feeToken: 'USDC' | 'SOL' = 'USDC',
  ): Promise<PreparedSwap> {
    try {
      // Clean up expired pending swaps
      this.cleanupExpiredPendingSwaps();

      // 1. Validate quote is still valid
      const provider = providerRegistry.getProvider(quote.provider);
      if (!provider) {
        throw new NotFoundError('Provider', quote.provider);
      }

      const validation = await provider.validateQuote(quote);
      if (!feeValidator.validateQuoteDrift(validation)) {
        throw new QuoteDriftError(validation.driftPercentage * 100);
      }

      // 2. Extract request params and estimate costs
      const reqParams = this.extractRequestParams(quote);
      const costs = await provider.estimateCosts({
        sourceChain: 'solana',
        sourceToken: reqParams.sourceToken,
        sourceAmount: quote.sourceAmount,
        destChain: reqParams.destChain,
        destToken: reqParams.destToken,
        userWallet,
        destWallet: reqParams.destWallet,
      });

      // 3. Build transaction from provider
      const { transaction: providerTxBytes, providerId: realProviderId } =
        await provider.buildTransaction(quote, this.sponsorSigner.address, userWallet);

      // 4. Branch: sponsored (USDC) vs direct (SOL)
      let completeTx: Uint8Array;
      let userFee: UserFee;
      let finalCosts = costs;

      if (feeToken === 'SOL') {
        // Direct mode: provider already built a valid transaction with user as
        // fee payer.  We only replace the blockhash with one from our own RPC
        // (provider APIs like DeBridge use their own node, whose blockhash our
        // RPC and the user's wallet may not recognise → BlockhashNotFound).
        // The rest of the transaction (ALTs, accounts, instructions) stays intact.
        completeTx = await transactionBuilder.replaceBlockhash(providerTxBytes);
        userFee = { token: 'SOL', amount: 0, valueUSD: 0 };
      } else {
        // Sponsored mode: DeBridge needs SOL from user for order PDA rent
        const solAdvance = quote.provider === 'debridge' ? DEBRIDGE_ORDER_RENT_LAMPORTS : 0;
        finalCosts = this.adjustCostsForSponsoredMode(costs, solAdvance);

        const minFees = await feeCalculator.calculateMinimumFee(finalCosts);
        userFee = { token: 'USDC', amount: minFees.feeInUsdc, valueUSD: minFees.feeInUsdc };

        // Validate economic guarantees
        const guarantees = await feeValidator.validateEconomicGuarantees(
          quote,
          userFee,
          finalCosts,
        );
        if (!guarantees.valid) {
          throw new EconomicValidationError(guarantees.errors);
        }

        // Add fee transfer + SOL advance + sponsor signature
        completeTx = await transactionBuilder.addFeeTransferToTransaction(
          providerTxBytes,
          userWallet,
          this.sponsorSigner,
          userFee,
          solAdvance, // sponsor → user SOL for DeBridge order rent
        );

        // Validate transaction safety (sponsor fund leak protection)
        const txValidation = transactionBuilder.validateNoFundLeak(
          completeTx,
          this.sponsorSigner.address,
        );
        if (!txValidation.isValid) {
          throw new TransactionValidationError(txValidation.errors);
        }
      }

      // 5. Validate transaction size + simulate
      const txSize = transactionBuilder.validateTransactionSize(completeTx);
      logger.info('Transaction built', {
        provider: quote.provider,
        mode: feeToken === 'SOL' ? 'direct' : 'sponsored',
        txSize: txSize.size,
        maxSize: txSize.maxSize,
        sizeValid: txSize.valid,
      });

      if (!txSize.valid) {
        logger.error('Transaction exceeds Solana size limit', {
          size: txSize.size,
          max: txSize.maxSize,
          provider: quote.provider,
          mode: feeToken,
        });
      }

      const simulation = await transactionBuilder.simulateTransaction(completeTx);
      if (!simulation.success) {
        logger.warn('Transaction simulation failed', {
          error: simulation.error,
          provider: quote.provider,
          mode: feeToken === 'SOL' ? 'direct' : 'sponsored',
          logs: simulation.logs?.slice(-5),
        });

        // Check for known, actionable errors
        const logs = simulation.logs?.join(' ') ?? '';
        if (logs.includes('insufficient funds')) {
          const tokenLabel = feeToken === 'USDC' ? 'USDC' : 'SOL';
          throw new AppError(
            `Insufficient ${tokenLabel} balance to cover the ${userFee.amount.toFixed(2)} ${tokenLabel} fee. Please top up your wallet and try again.`,
            'INSUFFICIENT_BALANCE',
            400,
          );
        }
      }

      // 6. Store in pending cache (NOT database) — persisted only after user signs
      const swapId = crypto.randomUUID();
      const validUntil = new Date(Date.now() + QUOTE_EXPIRY_SECONDS * 1000);

      this.pendingSwaps.set(swapId, {
        createData: {
          userWallet,
          destWallet: reqParams.destWallet,
          sourceChain: 'solana',
          sourceToken: reqParams.sourceToken,
          sourceAmount: quote.sourceAmount,
          destChain: reqParams.destChain,
          destToken: reqParams.destToken,
          destAmount: quote.destAmount,
          provider: quote.provider,
          providerId: realProviderId || quote.quoteId,
          quoteId: quote.quoteId,
          userFeeToken: userFee.token,
          userFeeAmount: userFee.amount.toString(),
          sponsorCostsSol: feeToken === 'SOL' ? '0' : finalCosts.totalSponsorCost.toString(),
          estimatedDuration: quote.estimatedDuration,
        },
        validUntil,
      });

      return {
        quote,
        transaction: completeTx,
        userFee,
        sponsorCosts: finalCosts,
        validUntil,
        swapId,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error(
        'Failed to prepare swap',
        error instanceof Error ? error : { error: String(error) },
      );
      throw new BridgeError('Failed to prepare swap', quote.provider, { cause: error });
    }
  }

  /**
   * Execute swap after user signs.
   * Creates DB record only now (user confirmed by signing).
   */
  async executeSwap(
    swapId: string,
    userSignedTx: string, // Base64 encoded signed transaction
  ): Promise<ExecutionResult> {
    // 1. Get pending swap from cache
    const pending = this.pendingSwaps.get(swapId);
    if (!pending) {
      throw new NotFoundError('Swap', swapId);
    }

    const { createData, validUntil } = pending;

    // 2. Check expiry
    if (new Date() > validUntil) {
      this.pendingSwaps.delete(swapId);
      throw new QuoteExpiredError();
    }

    try {
      // 3. Decode user-signed transaction bytes
      const txBytes = new Uint8Array(Buffer.from(userSignedTx, 'base64'));

      // 4. Final validation (only for sponsored swaps — direct mode has no sponsor to protect)
      if (createData.userFeeToken !== 'SOL') {
        const validation = transactionBuilder.validateNoFundLeak(
          txBytes,
          this.sponsorSigner.address,
        );
        if (!validation.isValid) {
          this.pendingSwaps.delete(swapId);
          return {
            swapId,
            status: 'failed',
            error: validation.errors.join(', '),
          };
        }
      }

      // 5. Create DB record NOW (user has confirmed by signing)
      // Use the same swapId from prepareSwap so the caller can track it consistently
      await swapRepository.create(createData, PrismaSwapStatus.SUBMITTED, swapId);
      this.pendingSwaps.delete(swapId);

      // 6. Send transaction
      const result = await solanaService.sendAndConfirmTransaction(txBytes);

      if (!result.success) {
        await swapRepository.updateStatus(swapId, PrismaSwapStatus.FAILED, {
          errorMessage: result.error,
        });

        return {
          swapId: swapId,
          status: 'failed',
          error: result.error,
        };
      }

      // 7. Update status with signature
      await swapRepository.updateStatus(swapId, PrismaSwapStatus.SUBMITTED, {
        solanaSignature: result.signature,
      });

      // 8. Start monitoring (async)
      this.monitorSwapAsync(swapId, createData.provider, createData.providerId);

      return {
        swapId: swapId,
        status: 'submitted',
        signature: result.signature,
      };
    } catch (error) {
      logger.error(
        'Failed to execute swap',
        error instanceof Error ? error : { error: String(error) },
      );

      this.pendingSwaps.delete(swapId);

      if (error instanceof AppError) throw error;

      return {
        swapId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to execute swap',
      };
    }
  }

  /**
   * Get swap status
   */
  async getSwapStatus(swapId: string): Promise<SwapStatus> {
    const swap = await swapRepository.findById(swapId);

    if (!swap) {
      throw new NotFoundError('Swap', swapId);
    }

    // Get status from provider if bridging
    if (swap.status === PrismaSwapStatus.SUBMITTED || swap.status === PrismaSwapStatus.BRIDGING) {
      try {
        const provider = providerRegistry.getProvider(swap.provider);
        if (provider) {
          const providerStatus = await provider.getStatus(swap.providerId);

          return {
            swapId,
            status: providerStatus.status,
            sourceChainTx: providerStatus.sourceChainTx || swap.solanaSignature || undefined,
            destChainTx: providerStatus.destChainTx || swap.evmSignature || undefined,
            progress: this.calculateProgress(providerStatus.status),
            error: providerStatus.error,
          };
        }
      } catch (error) {
        logger.error(
          'Failed to get provider status',
          error instanceof Error ? error : { error: String(error) },
        );
      }
    }

    return {
      swapId,
      status: swap.status.toLowerCase(),
      sourceChainTx: swap.solanaSignature || undefined,
      destChainTx: swap.evmSignature || undefined,
      progress: this.calculateProgress(swap.status.toLowerCase()),
      error: swap.errorMessage || undefined,
    };
  }

  /**
   * Monitor swap progress (async, non-blocking) with proper cleanup
   */
  private async monitorSwapAsync(
    swapId: string,
    providerName: string,
    providerId: string,
  ): Promise<void> {
    const provider = providerRegistry.getProvider(providerName);
    if (!provider) return;

    // Create AbortController for this monitoring session
    const abortController = new AbortController();
    this.activeMonitors.set(swapId, abortController);

    // Poll for status updates
    const maxAttempts = MONITOR_MAX_ATTEMPTS;
    let attempts = 0;

    const cleanup = () => {
      clearInterval(interval);
      this.activeMonitors.delete(swapId);
    };

    const interval = setInterval(async () => {
      // Check if monitoring was aborted
      if (abortController.signal.aborted) {
        cleanup();
        return;
      }

      try {
        attempts++;

        const status = await provider.getStatus(providerId);

        // Update database based on status
        if (status.status === 'processing') {
          await swapRepository.updateStatus(swapId, PrismaSwapStatus.BRIDGING);
        } else if (status.status === 'completed') {
          await swapRepository.updateStatus(swapId, PrismaSwapStatus.COMPLETED, {
            evmSignature: status.destChainTx,
          });
          cleanup();
        } else if (status.status === 'failed') {
          await swapRepository.updateStatus(swapId, PrismaSwapStatus.FAILED, {
            errorMessage: status.error,
          });
          cleanup();
        }

        // Stop after max attempts
        if (attempts >= maxAttempts) {
          logger.warn('Monitoring timeout for swap', {
            swapId,
            maxAttempts,
            provider: providerName,
          });
          cleanup();
        }
      } catch (error) {
        logger.error(
          'Error monitoring swap',
          error instanceof Error ? error : { error: String(error) },
        );
        // Don't cleanup on error - continue monitoring
      }
    }, MONITOR_POLL_INTERVAL_MS);

    // Cleanup on abort
    abortController.signal.addEventListener('abort', () => {
      cleanup();
    });
  }

  /**
   * Stop monitoring a specific swap
   */
  public stopMonitoring(swapId: string): void {
    const controller = this.activeMonitors.get(swapId);
    if (controller) {
      controller.abort();
      logger.info('Stopped monitoring swap', { swapId });
    }
  }

  /**
   * Stop all active monitoring sessions
   */
  public stopAllMonitoring(): void {
    logger.info('Stopping all active monitoring sessions', {
      activeMonitors: this.activeMonitors.size,
    });
    for (const controller of this.activeMonitors.values()) {
      controller.abort();
    }
    this.activeMonitors.clear();
  }

  /**
   * Remove expired entries from the pending swaps cache
   */
  private cleanupExpiredPendingSwaps(): void {
    const now = new Date();
    for (const [id, pending] of this.pendingSwaps) {
      if (now > pending.validUntil) {
        this.pendingSwaps.delete(id);
      }
    }
  }

  /**
   * Extract original request params from a quote's rawQuote in a provider-agnostic way.
   * Both providers store _requestParams in rawQuote during getQuote.
   */
  private extractRequestParams(quote: BridgeQuote): {
    sourceToken: string;
    destChain: string;
    destToken: string;
    destWallet: string;
  } {
    if (quote.provider === 'relay') {
      const raw = quote.rawQuote as RelayRawQuote;
      const rp = raw._requestParams;
      return {
        sourceToken: rp.originCurrency || '',
        destChain: String(rp.destinationChainId || ''),
        destToken: rp.destinationCurrency || '',
        destWallet: rp.recipient || '',
      };
    }

    // debridge
    const raw = quote.rawQuote as DeBridgeRawQuote;
    const srcIn = raw.estimation?.srcChainTokenIn;
    const dstOut = raw.estimation?.dstChainTokenOut;

    return {
      sourceToken: srcIn?.address || raw._requestParams.srcChainTokenIn || '',
      destChain: dstOut?.chainId?.toString() || raw._requestParams.dstChainId || '',
      destToken: dstOut?.address || raw._requestParams.dstChainTokenOut || '',
      destWallet: raw.dstChainTokenOutRecipient || '',
    };
  }

  /**
   * Calculate progress percentage based on status
   */
  private calculateProgress(status: string): number {
    const progressMap: Record<string, number> = {
      pending: 10,
      building: 20,
      awaiting_user_sig: 30,
      submitted: 50,
      processing: 70,
      bridging: 70,
      completed: 100,
      failed: 0,
      cancelled: 0,
    };

    return progressMap[status] || 0;
  }
}

// Persist singleton across Next.js hot reloads via globalThis
const globalForSwap = globalThis as unknown as {
  __swapOrchestrator?: SwapOrchestrator;
};

export async function getSwapOrchestrator(): Promise<SwapOrchestrator> {
  // Register providers if registry is empty (first boot)
  if (providerRegistry.getProviderCount() === 0) {
    providerRegistry.register(new RelayProvider());
    providerRegistry.register(new DeBridgeProvider());
  }

  if (!globalForSwap.__swapOrchestrator) {
    const sponsorKey = env.SPONSOR_WALLET_PRIVATE_KEY;
    if (!sponsorKey) {
      throw new ConfigError('SPONSOR_WALLET_PRIVATE_KEY not configured');
    }
    globalForSwap.__swapOrchestrator = await SwapOrchestrator.create(sponsorKey);
  }
  return globalForSwap.__swapOrchestrator;
}

export async function initializeSwapOrchestrator(sponsorPrivateKey: string): Promise<void> {
  globalForSwap.__swapOrchestrator = await SwapOrchestrator.create(sponsorPrivateKey);
}
