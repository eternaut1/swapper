'use server';

import { initializeApp, isInitialized } from '@/lib/init';
import { logger } from '@/lib/utils/logger';

/**
 * Server Action: Initialize the application
 * Replaces: GET /api/init
 */
export async function initializeAppAction() {
  try {
    if (isInitialized()) {
      return {
        success: true,
        message: 'Already initialized',
        initialized: true,
      };
    }

    await initializeApp();

    return {
      success: true,
      message: 'Application initialized successfully',
      initialized: true,
    };
  } catch (error: unknown) {
    logger.error(
      'Initialization error:',
      error instanceof Error ? error : { error: String(error) },
    );
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to initialize application';
    return {
      success: false,
      error: errorMessage,
      initialized: false,
    };
  }
}
