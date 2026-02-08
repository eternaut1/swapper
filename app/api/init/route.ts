import { NextResponse } from 'next/server';
import { toErrorResponse, toErrorStatusCode } from '@/lib/errors';
import { initializeApp, isInitialized } from '@/lib/init';
import { logger } from '@/lib/utils/logger';

export async function GET() {
  try {
    if (isInitialized()) {
      return NextResponse.json({
        success: true,
        message: 'Already initialized',
        initialized: true,
      });
    }

    await initializeApp();

    return NextResponse.json({
      success: true,
      message: 'Application initialized successfully',
      initialized: true,
    });
  } catch (error: unknown) {
    logger.error(
      'Initialization error:',
      error instanceof Error ? error : { error: String(error) },
    );
    return NextResponse.json(
      { ...toErrorResponse(error), initialized: false },
      { status: toErrorStatusCode(error) },
    );
  }
}
