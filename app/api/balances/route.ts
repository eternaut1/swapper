import { type NextRequest, NextResponse } from 'next/server';
import { balancesQuerySchema, parseRequest } from '@/lib/api/schemas';
import { SOLANA_CHAIN_ID } from '@/lib/config/constants';
import { getTokensForChainFast } from '@/lib/config/tokens';
import { toErrorResponse, toErrorStatusCode } from '@/lib/errors';
import { solanaService } from '@/lib/solana/SolanaService';
import { logger } from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  try {
    const { wallet } = parseRequest(
      { wallet: request.nextUrl.searchParams.get('wallet') },
      balancesQuerySchema,
    );

    // Fetch ALL token accounts from the wallet via RPC (never blocks on external APIs).
    // Pass cached token metadata for enrichment (symbol, name, logo) if available.
    const knownTokens = getTokensForChainFast(SOLANA_CHAIN_ID);
    const tokens = await solanaService.getWalletTokenBalances(wallet, knownTokens);

    return NextResponse.json({ success: true, tokens });
  } catch (error: unknown) {
    // Use plain object for logging — some RPC errors are frozen and crash pino's serializer
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Balances API error:', { error: errMsg });
    return NextResponse.json(toErrorResponse(error), { status: toErrorStatusCode(error) });
  }
}
