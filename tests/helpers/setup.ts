/**
 * Test setup and teardown helpers
 * Handles database seeding, API mocking, and cleanup
 */

import type { APIRequestContext, Page, Route } from '@playwright/test';
import { test as base } from '@playwright/test';

/**
 * Extended test fixture with setup/teardown
 */
export const test = base.extend<{
  authenticatedRequest: APIRequestContext;
  testUserId: string;
}>({
  // Provide a test user ID for authenticated requests
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires destructured first arg
  testUserId: async ({}, use) => {
    const userId = `test-user-${Date.now()}`;
    await use(userId);
  },

  // Provide an authenticated request context
  authenticatedRequest: async ({ request }, use) => {
    // In a real app, you'd get a JWT token here
    // For now, we'll just use the regular request context
    await use(request);
  },
});

export { expect } from '@playwright/test';

/**
 * Mock external API routes for testing
 * This should be set up in a global test setup file
 */
export async function setupApiMocks(page: Page) {
  // Mock Relay API
  await page.route('**/api.relay.link/**', (route: Route) => {
    const url = new URL(route.request().url());

    if (url.pathname.includes('/quote')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'relay-quote-mock',
          toAmount: '990000',
          destinationAmount: '990000',
          estimatedTime: 300,
        }),
      });
    } else if (url.pathname.includes('/execute')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          transaction: Buffer.from('mock-tx').toString('base64'),
        }),
      });
    } else if (url.pathname.includes('/status')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          originTxHash: `0x${'1'.repeat(64)}`,
          destinationTxHash: `0x${'2'.repeat(64)}`,
        }),
      });
    } else {
      route.continue();
    }
  });

  // Mock DeBridge API
  await page.route('**/api.debridge.finance/**', (route: Route) => {
    const url = new URL(route.request().url());

    if (url.pathname.includes('/create-tx')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'debridge-order-mock',
          estimation: {
            dstChainTokenOut: { amount: '990000' },
            approximateFulfillmentDelay: 180,
          },
          tx: {
            data: Buffer.from('mock-tx').toString('hex'),
          },
        }),
      });
    } else if (url.pathname.includes('/order/')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'OrderFulfilled',
          orderId: 'debridge-order-mock',
        }),
      });
    } else {
      route.continue();
    }
  });

  // Mock Solana RPC
  await page.route('**/api.mainnet-beta.solana.com', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        result: {
          value: 1000000000, // Mock balance
        },
        id: 1,
      }),
    });
  });
}

/**
 * Database helpers for test data management
 */
export const TestDatabase = {
  async seed(_data: {
    swaps?: Record<string, unknown>[];
    users?: Record<string, unknown>[];
  }): Promise<void> {},

  async cleanup(_filters?: { swapIds?: string[]; userIds?: string[] }): Promise<void> {},

  async reset(): Promise<void> {},

  getConnectionString(): string {
    return process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  },
};

/**
 * Wallet mock helpers
 */
export const MockWallet = {
  async connect(page: Page, walletType: 'phantom' | 'metamask' = 'phantom'): Promise<void> {
    await page.evaluate((type: string) => {
      if (type === 'phantom') {
        (window as Record<string, unknown>).solana = {
          isPhantom: true,
          publicKey: {
            toString: () => 'MockSolanaAddress123456789012345678901234',
          },
          connect: async () => ({
            publicKey: {
              toString: () => 'MockSolanaAddress123456789012345678901234',
            },
          }),
          disconnect: async () => {},
          signTransaction: async (tx: unknown) => tx,
          signAllTransactions: async (txs: unknown[]) => txs,
        };
      }
    }, walletType);
  },

  async sign(_page: Page, transaction: string): Promise<string> {
    return `mock-signature-${Buffer.from(transaction).toString('base64').substring(0, 20)}`;
  },

  async disconnect(page: Page): Promise<void> {
    await page.evaluate(() => {
      delete (window as Record<string, unknown>).solana;
      delete (window as Record<string, unknown>).ethereum;
    });
  },
};

/**
 * Test environment configuration
 */
export const TestConfig = {
  /**
   * API base URL for tests
   */
  apiUrl: process.env.TEST_API_URL || 'http://localhost:3000',

  /**
   * Test timeout (ms)
   */
  timeout: parseInt(process.env.TEST_TIMEOUT || '30000', 10),

  /**
   * Slow test threshold (ms)
   */
  slowThreshold: parseInt(process.env.TEST_SLOW_THRESHOLD || '5000', 10),

  /**
   * Whether to run tests in headless mode
   */
  headless: process.env.TEST_HEADLESS !== 'false',

  /**
   * Whether to take screenshots on failure
   */
  screenshotOnFailure: process.env.TEST_SCREENSHOT !== 'false',

  /**
   * Test database URL
   */
  databaseUrl: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
};

/**
 * Global test hooks
 */
export function setupTestHooks() {
  // Before all tests
  base.beforeAll(async () => {
    // Initialize test database
    // Set up global mocks
  });

  // After all tests
  base.afterAll(async () => {
    // Clean up test database
    // Remove global mocks
  });

  // Before each test
  base.beforeEach(async ({ page }) => {
    // Set up API mocks for this test
    if (page) {
      await setupApiMocks(page);
    }
  });

  // After each test
  base.afterEach(async ({ page }, testInfo) => {
    // Take screenshot on failure
    if (testInfo.status === 'failed' && TestConfig.screenshotOnFailure && page) {
      await page.screenshot({
        path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}.png`,
      });
    }
  });
}
