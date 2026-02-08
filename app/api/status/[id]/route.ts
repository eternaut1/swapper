import { type NextRequest, NextResponse } from 'next/server';
import { toErrorResponse, toErrorStatusCode, ValidationError } from '@/lib/errors';
import { getSwapOrchestrator } from '@/lib/swap';
import { logger } from '@/lib/utils/logger';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: swapId } = await params;

    if (!swapId) {
      throw new ValidationError('Missing swap ID');
    }

    // Get orchestrator and fetch status
    const orchestrator = await getSwapOrchestrator();
    const status = await orchestrator.getSwapStatus(swapId);

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error: unknown) {
    if (toErrorStatusCode(error) !== 404) {
      logger.error('Status API error:', error instanceof Error ? error : { error: String(error) });
    }
    return NextResponse.json(toErrorResponse(error), { status: toErrorStatusCode(error) });
  }
}
