import { type NextRequest, NextResponse } from 'next/server';
import { historyQuerySchema, parseRequest } from '@/lib/api/schemas';
import { SOLANA_CHAIN_ID } from '@/lib/config/constants';
import { findToken } from '@/lib/config/tokens';
import { swapRepository } from '@/lib/db/swaps';
import { toErrorResponse, toErrorStatusCode } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { wallet, limit } = parseRequest(
      {
        wallet: searchParams.get('wallet'),
        limit: searchParams.get('limit') ?? undefined,
      },
      historyQuerySchema,
    );

    const swaps = await swapRepository.findByUser(wallet, limit);
    const stats = await swapRepository.getStats(wallet);

    // Enrich swaps with token metadata for display
    const enriched = await Promise.all(
      swaps.map(async (swap) => {
        const [srcToken, dstToken] = await Promise.all([
          findToken(SOLANA_CHAIN_ID, swap.sourceToken),
          findToken(swap.destChain, swap.destToken),
        ]);
        return {
          ...swap,
          sourceSymbol: srcToken?.symbol,
          sourceDecimals: srcToken?.decimals,
          destSymbol: dstToken?.symbol,
          destDecimals: dstToken?.decimals,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      swaps: enriched,
      stats,
    });
  } catch (error: unknown) {
    // Re-throw Next.js internal errors (prerender interruptions, redirects, etc.)
    if (typeof (error as Record<string, unknown>)?.['digest'] === 'string') {
      throw error;
    }
    logger.error('History API error:', error instanceof Error ? error : { error: String(error) });
    return NextResponse.json(toErrorResponse(error), { status: toErrorStatusCode(error) });
  }
}
