import { type NextRequest, NextResponse } from 'next/server';
import { executeSchema, parseRequest } from '@/lib/api/schemas';
import { toErrorResponse, toErrorStatusCode } from '@/lib/errors';
import { getSwapOrchestrator } from '@/lib/swap';
import { logger } from '@/lib/utils/logger';
import type { BridgeQuote } from '@/types/bridge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quote, userWallet, feeToken } = parseRequest(body, executeSchema);

    const orchestrator = await getSwapOrchestrator();
    const preparedSwap = await orchestrator.prepareSwap(
      quote as unknown as BridgeQuote,
      userWallet,
      feeToken,
    );

    const serializedTx = Buffer.from(preparedSwap.transaction).toString('base64');

    return NextResponse.json({
      success: true,
      swapId: preparedSwap.swapId,
      transaction: serializedTx,
      userFee: preparedSwap.userFee,
      sponsorCosts: preparedSwap.sponsorCosts,
      validUntil: preparedSwap.validUntil.toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Execute API error:', error instanceof Error ? error : { error: String(error) });
    return NextResponse.json(toErrorResponse(error), { status: toErrorStatusCode(error) });
  }
}
