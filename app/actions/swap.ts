'use server';

import { revalidatePath } from 'next/cache';
import { getSwapOrchestrator } from '@/lib/swap';
import { logger } from '@/lib/utils/logger';
import type { BridgeQuote } from '@/types/bridge';

/**
 * Server Action: Prepare a swap transaction
 * Replaces: POST /api/execute
 */
export async function prepareSwapAction(
  quote: BridgeQuote,
  userWallet: string,
  feeToken: 'USDC' | 'SOL' = 'USDC',
) {
  try {
    // Validate required fields
    if (!quote || !userWallet) {
      return {
        success: false,
        error: 'Missing required fields: quote, userWallet',
      };
    }

    // Validate feeToken
    if (feeToken !== 'USDC' && feeToken !== 'SOL') {
      return {
        success: false,
        error: 'Invalid feeToken. Must be USDC or SOL',
      };
    }

    // Get orchestrator and prepare swap
    const orchestrator = await getSwapOrchestrator();
    const preparedSwap = await orchestrator.prepareSwap(quote, userWallet, feeToken);

    // Serialize transaction for transmission (already Uint8Array)
    const serializedTx = Buffer.from(preparedSwap.transaction).toString('base64');

    return {
      success: true,
      swapId: preparedSwap.swapId,
      transaction: serializedTx,
      userFee: preparedSwap.userFee,
      sponsorCosts: preparedSwap.sponsorCosts,
      validUntil: preparedSwap.validUntil.toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      'Prepare swap action error:',
      error instanceof Error ? error : { error: String(error) },
    );
    const errorMessage = error instanceof Error ? error.message : 'Failed to prepare swap';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Server Action: Execute a signed swap transaction
 * Replaces: POST /api/execute/confirm
 */
export async function executeSwapAction(swapId: string, signedTransaction: string) {
  try {
    // Validate required fields
    if (!swapId || !signedTransaction) {
      return {
        success: false,
        error: 'Missing required fields: swapId, signedTransaction',
      };
    }

    // Get orchestrator and execute swap
    const orchestrator = await getSwapOrchestrator();
    const result = await orchestrator.executeSwap(swapId, signedTransaction);

    // Revalidate history page after swap execution
    revalidatePath('/history');

    return {
      success: result.status === 'submitted',
      swapId: result.swapId,
      status: result.status,
      signature: result.signature,
      error: result.error,
    };
  } catch (error: unknown) {
    logger.error(
      'Execute swap action error:',
      error instanceof Error ? error : { error: String(error) },
    );
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute swap';
    return {
      success: false,
      error: errorMessage,
    };
  }
}
