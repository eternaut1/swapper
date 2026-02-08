import { type NextRequest, NextResponse } from 'next/server';
import { confirmSchema, parseRequest } from '@/lib/api/schemas';
import { toErrorResponse, toErrorStatusCode } from '@/lib/errors';
import { getSwapOrchestrator } from '@/lib/swap';
import { logger } from '@/lib/utils/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { swapId, signedTransaction } = parseRequest(body, confirmSchema);

    const orchestrator = await getSwapOrchestrator();
    const result = await orchestrator.executeSwap(swapId, signedTransaction);

    return NextResponse.json({
      success: result.status === 'submitted',
      swapId: result.swapId,
      status: result.status,
      signature: result.signature,
      error: result.error,
    });
  } catch (error: unknown) {
    logger.error(
      'Execute confirm API error:',
      error instanceof Error ? error : { error: String(error) },
    );
    return NextResponse.json(toErrorResponse(error), { status: toErrorStatusCode(error) });
  }
}
