import { DeBridgeProvider } from '@/lib/bridges/DeBridgeProvider';
import { providerRegistry } from '@/lib/bridges/ProviderRegistry';
import { RelayProvider } from '@/lib/bridges/RelayProvider';
import { env } from '@/lib/config/env';
import { fetchSupportedTokens } from '@/lib/config/tokens';
import { initializeSwapOrchestrator } from '@/lib/swap';
import { logger } from '@/lib/utils/logger';

let initialized = false;

/**
 * Initialize the application
 * - Register bridge providers
 * - Fetch supported tokens
 * - Initialize swap orchestrator
 */
export async function initializeApp(): Promise<void> {
  if (initialized) {
    logger.info('App already initialized');
    return;
  }

  try {
    logger.info('Initializing application...');

    // 1. Validate environment variables
    const sponsorKey = env.SPONSOR_WALLET_PRIVATE_KEY;
    if (!sponsorKey) {
      throw new Error('SPONSOR_WALLET_PRIVATE_KEY environment variable is required');
    }

    // 2. Register bridge providers
    logger.info('Registering bridge providers...');
    const relayProvider = new RelayProvider();
    const debridgeProvider = new DeBridgeProvider();

    providerRegistry.register(relayProvider);
    providerRegistry.register(debridgeProvider);

    logger.info(`Registered ${providerRegistry.getProviderCount()} providers`);

    // 3. Fetch supported tokens from all providers
    logger.info('Fetching supported tokens from providers...');
    await fetchSupportedTokens();

    // 4. Initialize swap orchestrator
    logger.info('Initializing swap orchestrator...');
    await initializeSwapOrchestrator(sponsorKey);

    initialized = true;
    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error(
      'Failed to initialize application:',
      error instanceof Error ? error : { error: String(error) },
    );
    throw error;
  }
}

/**
 * Check if app is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Reset initialization state (for testing)
 */
export function resetInitialization(): void {
  initialized = false;
}
