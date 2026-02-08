import { type NextRequest, NextResponse } from 'next/server';
import { parseRequest, quoteSchema } from '@/lib/api/schemas';
import { SOLANA_CHAIN_ID } from '@/lib/config/constants';
import { findToken } from '@/lib/config/tokens';
import { toErrorResponse, toErrorStatusCode } from '@/lib/errors';
import { getSwapOrchestrator } from '@/lib/swap';
import { logger } from '@/lib/utils/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = parseRequest(body, quoteSchema);

    // Convert human-readable amount to base units using token decimals
    const token = await findToken(SOLANA_CHAIN_ID, params.sourceToken);
    const decimals = token?.decimals ?? 6;
    const baseAmount = BigInt(
      Math.round(parseFloat(params.sourceAmount) * 10 ** decimals),
    ).toString();

    const orchestrator = await getSwapOrchestrator();
    const quotes = await orchestrator.getAggregatedQuotes({
      sourceChain: 'solana',
      ...params,
      sourceAmount: baseAmount,
    });

    return NextResponse.json({
      success: true,
      quotes: quotes.quotes,
      bestQuote: quotes.bestQuote,
      recommendedQuote: quotes.recommendedQuote,
      providerResults: quotes.providerResults,
    });
  } catch (error: unknown) {
    logger.error('Quote API error:', error instanceof Error ? error : { error: String(error) });
    return NextResponse.json(toErrorResponse(error), { status: toErrorStatusCode(error) });
  }
}
