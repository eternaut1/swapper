import { type NextRequest, NextResponse } from 'next/server';
import { getTokensForChain } from '@/lib/config/tokens';
import { toErrorResponse, toErrorStatusCode } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  try {
    const chainId = request.nextUrl.searchParams.get('chainId');
    if (!chainId) {
      return NextResponse.json(
        { success: false, error: 'chainId query parameter is required' },
        { status: 400 },
      );
    }

    const tokens = await getTokensForChain(chainId);

    return NextResponse.json({ success: true, tokens });
  } catch (error: unknown) {
    logger.error('Tokens API error:', error instanceof Error ? error : { error: String(error) });
    return NextResponse.json(toErrorResponse(error), { status: toErrorStatusCode(error) });
  }
}
