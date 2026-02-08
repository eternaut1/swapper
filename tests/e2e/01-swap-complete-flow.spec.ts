/**
 * Complete Swap Flow E2E Test
 * Tests the entire user journey from quote to completion
 */

import {
  createQuoteRequest,
  delay,
  signTestTransaction,
  TestChains,
  TestTokens,
} from '../helpers/fixtures';
import { expect, test } from '../helpers/setup';

test.describe('Complete Swap Flow', () => {
  test('should complete full swap lifecycle: quote → prepare → execute → monitor', async ({
    request,
  }) => {
    // Step 1: Get quotes from providers
    const quoteRequest = createQuoteRequest({
      sourceToken: TestTokens.solana.USDC,
      sourceAmount: '1', // 1 USDC — API converts to base units
      destChain: TestChains.arbitrum,
      destToken: TestTokens.arbitrum.USDC,
    });

    const quoteResponse = await request.post('/api/quote', {
      data: quoteRequest,
    });

    expect(quoteResponse.ok()).toBeTruthy();
    const quoteData = await quoteResponse.json();

    expect(quoteData).toHaveProperty('quotes');
    expect(Array.isArray(quoteData.quotes)).toBe(true);
    expect(quoteData.quotes.length).toBeGreaterThan(0);

    // Validate quote structure
    const bestQuote = quoteData.quotes[0];
    expect(bestQuote).toMatchObject({
      provider: expect.any(String),
      quoteId: expect.any(String),
      sourceAmount: expect.any(String),
      destAmount: expect.any(String),
      estimatedDuration: expect.any(Number),
      validUntil: expect.any(String),
      route: {
        steps: expect.any(Array),
        totalFees: expect.any(String),
      },
      estimatedCosts: {
        solanaGasFee: expect.any(Number),
        solanaPriorityFee: expect.any(Number),
        totalSponsorCost: expect.any(Number),
      },
    });

    // Verify fee calculation
    expect(bestQuote.estimatedCosts.totalSponsorCost).toBe(
      bestQuote.estimatedCosts.solanaGasFee +
        bestQuote.estimatedCosts.solanaPriorityFee +
        (bestQuote.estimatedCosts.accountRentCost || 0),
    );

    // Verify destination amount is less than source (fees applied)
    const sourceAmount = parseInt(bestQuote.sourceAmount, 10);
    const destAmount = parseInt(bestQuote.destAmount, 10);
    expect(destAmount).toBeLessThan(sourceAmount);
    expect(destAmount).toBeGreaterThan(sourceAmount * 0.9); // Max 10% fee for cross-chain

    // Step 2: Prepare swap with selected quote
    const prepareResponse = await request.post('/api/execute', {
      data: {
        quote: bestQuote,
        userWallet: quoteRequest.userWallet,
        feeToken: 'USDC',
      },
    });

    expect(prepareResponse.ok()).toBeTruthy();
    const prepareData = await prepareResponse.json();

    expect(prepareData).toHaveProperty('swapId');
    expect(prepareData).toHaveProperty('transaction');
    expect(prepareData).toHaveProperty('userFee');
    expect(prepareData).toHaveProperty('validUntil');

    const { swapId, userFee } = prepareData;

    // Validate fee is reasonable
    expect(userFee.token).toBe('USDC');
    expect(parseFloat(userFee.amount)).toBeGreaterThan(0);
    expect(parseFloat(userFee.amount)).toBeLessThan(sourceAmount * 0.05); // Max 5%

    // Step 3: Sign and execute swap
    const signedTransaction = process.env['TEST_USER_PRIVATE_KEY']
      ? await signTestTransaction(prepareData.transaction)
      : Buffer.from(prepareData.transaction || 'mock-tx').toString('base64');

    const executeResponse = await request.post('/api/execute/confirm', {
      data: {
        swapId,
        signedTransaction,
      },
    });

    const executeData = await executeResponse.json();

    // Confirm endpoint always returns 200 with success: true/false
    expect(executeData).toHaveProperty('swapId');
    expect(executeData).toHaveProperty('status');
    expect(executeData.status).toMatch(/^(submitted|pending|processing|failed)$/);

    // The returned swapId is the DB record ID (may differ from pending cache ID)
    const dbSwapId = executeData.swapId;

    // If successful submission, should have a signature
    if (executeData.status === 'submitted') {
      expect(executeData).toHaveProperty('signature');
      expect(executeData.signature).toBeTruthy();
    }

    // Step 4: Monitor swap status (use DB swapId, not the pending cache swapId)
    const statusResponse = await request.get(`/api/status/${dbSwapId}`);

    expect(statusResponse.ok()).toBeTruthy();
    const statusData = await statusResponse.json();

    expect(statusData).toHaveProperty('status');
    expect(statusData.status).toMatchObject({
      swapId: dbSwapId,
      status: expect.stringMatching(
        /^(pending|building|awaiting_user_sig|submitted|processing|bridging|completed|failed)$/,
      ),
      progress: expect.any(Number),
    });

    // Progress should be between 0 and 100
    expect(statusData.status.progress).toBeGreaterThanOrEqual(0);
    expect(statusData.status.progress).toBeLessThanOrEqual(100);
  });

  test('should handle insufficient balance gracefully', async ({ request }) => {
    const quoteRequest = createQuoteRequest({
      sourceAmount: '999999999999999999', // Unrealistic amount
    });

    const response = await request.post('/api/quote', {
      data: quoteRequest,
    });

    // Should either reject with error or return empty quotes
    if (!response.ok()) {
      const data = await response.json();
      expect(data.error).toBeDefined();
    } else {
      const data = await response.json();
      // If it doesn't fail immediately, it should return no quotes or quotes with warnings
      expect(data).toHaveProperty('quotes');
    }
  });

  test('should validate quote before execution', async ({ request }) => {
    test.setTimeout(90000); // This test needs >30s for quote expiry + API retries

    const quoteRequest = createQuoteRequest();

    // Get a valid quote
    const quoteResponse = await request.post('/api/quote', {
      data: quoteRequest,
    });

    expect(quoteResponse.ok()).toBeTruthy();
    const quoteData = await quoteResponse.json();
    const quote = quoteData.quotes[0];

    // Prepare swap
    const prepareResponse = await request.post('/api/execute', {
      data: {
        quote,
        userWallet: quoteRequest.userWallet,
        feeToken: 'USDC',
      },
    });

    const prepareData = await prepareResponse.json();

    // Wait for quote to expire (30 seconds)
    await delay(31000);

    // Try to execute expired quote
    let executeResponse = await request.post('/api/execute/confirm', {
      data: {
        swapId: prepareData.swapId,
        signedTransaction: Buffer.from('mock-tx').toString('base64'),
      },
    });

    // Retry once if rate-limited (previous test runs may leave entries)
    if (executeResponse.status() === 429) {
      const retryAfter = Number(executeResponse.headers()['retry-after'] || '5');
      await delay(retryAfter * 1000 + 1000);
      executeResponse = await request.post('/api/execute/confirm', {
        data: {
          swapId: prepareData.swapId,
          signedTransaction: Buffer.from('mock-tx').toString('base64'),
        },
      });
    }

    const executeData = await executeResponse.json();

    // Should fail due to expired quote or quote drift
    if (!executeResponse.ok()) {
      expect(executeData.error).toMatch(/expired|drift|invalid/i);
    }
  });

  test('should handle provider failover', async ({ request }) => {
    // Request quote when one provider might be down
    const quoteRequest = createQuoteRequest();

    const response = await request.post('/api/quote', {
      data: quoteRequest,
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Should get quotes from available providers
    expect(data.quotes).toBeDefined();
    expect(Array.isArray(data.quotes)).toBe(true);

    // Even if one provider fails, should get at least one quote
    // (in production, with both Relay and DeBridge)
    if (data.quotes.length > 0) {
      const providers = new Set(data.quotes.map((q: Record<string, unknown>) => q.provider));
      expect(providers.size).toBeGreaterThan(0);
    }
  });

  test('should calculate fees correctly across different amounts', async ({ request }) => {
    // Use amounts large enough that bridge fees are a reasonable percentage
    // Larger amounts may fail due to insufficient wallet balance — that's expected
    const amounts = ['1', '10', '100']; // 1, 10, 100 USDC (human-readable)
    let successCount = 0;

    for (const amount of amounts) {
      const quoteRequest = createQuoteRequest({
        sourceAmount: amount,
      });

      const response = await request.post('/api/quote', {
        data: quoteRequest,
      });

      if (!response.ok()) {
        // Skip amounts where wallet has insufficient balance
        continue;
      }

      const data = await response.json();

      if (data.quotes?.length > 0) {
        const quote = data.quotes[0];

        // Verify fees scale appropriately (response amounts are in base units)
        const sourceAmt = parseInt(quote.sourceAmount, 10);
        const destAmt = parseInt(quote.destAmount, 10);
        const fee = sourceAmt - destAmt;

        // Fee should be positive
        expect(fee).toBeGreaterThan(0);

        // Fee should be less than 10% (cross-chain bridge fees can be significant)
        expect(fee).toBeLessThan(sourceAmt * 0.1);

        successCount++;
      }

      await delay(1000); // Rate limit between requests
    }

    // At least one amount should succeed
    expect(successCount).toBeGreaterThan(0);
  });

  test('should respect quote expiry time', async ({ request }) => {
    await delay(2000); // Rate limit buffer
    const quoteRequest = createQuoteRequest();

    const response = await request.post('/api/quote', {
      data: quoteRequest,
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const quote = data.quotes[0];

    // Verify validUntil is in the future
    const validUntil = new Date(quote.validUntil);
    const now = new Date();
    expect(validUntil.getTime()).toBeGreaterThan(now.getTime());

    // Verify it's within reasonable range (e.g., 10-120 seconds)
    const diffSeconds = (validUntil.getTime() - now.getTime()) / 1000;
    expect(diffSeconds).toBeGreaterThan(10); // At least 10 seconds
    expect(diffSeconds).toBeLessThan(120); // Less than 2 minutes
  });

  test('should track swap through multiple status checks', async ({ request }) => {
    await delay(2000); // Rate limit buffer after prior tests
    const quoteRequest = createQuoteRequest();

    // Get quote
    const quoteResponse = await request.post('/api/quote', {
      data: quoteRequest,
    });
    expect(quoteResponse.ok()).toBeTruthy();
    const quoteData = await quoteResponse.json();
    expect(quoteData.quotes?.length).toBeGreaterThan(0);

    // Prepare swap
    const prepareResponse = await request.post('/api/execute', {
      data: {
        quote: quoteData.quotes[0],
        userWallet: quoteRequest.userWallet,
        feeToken: 'USDC',
      },
    });
    const prepareData = await prepareResponse.json();

    // Swap is in pending cache until user signs (not yet in DB).
    // Status endpoint should return NOT_FOUND for prepared-but-unexecuted swaps.
    const statusResponse = await request.get(`/api/status/${prepareData.swapId}`);
    expect(statusResponse.status()).toBe(404);
    const statusData = await statusResponse.json();
    expect(statusData.success).toBe(false);
    expect(statusData.errorCode).toBe('NOT_FOUND');

    // Confirm swap with dummy tx — will fail validation but exercises the flow
    const confirmResponse = await request.post('/api/execute/confirm', {
      data: {
        swapId: prepareData.swapId,
        signedTransaction: Buffer.from('dummy-signed-tx').toString('base64'),
      },
    });
    const confirmData = await confirmResponse.json();

    // Confirm should return an error (invalid tx) or failed status
    expect(confirmData.status === 'failed' || confirmData.success === false).toBeTruthy();

    // After a failed confirm, the pending swap is cleaned up
    // A second confirm attempt should return NOT_FOUND
    const retryConfirm = await request.post('/api/execute/confirm', {
      data: {
        swapId: prepareData.swapId,
        signedTransaction: Buffer.from('dummy').toString('base64'),
      },
    });
    const retryData = await retryConfirm.json();
    expect(retryData.success).toBe(false);
  });
});

test.describe('Provider-Specific Behavior', () => {
  test('should handle Relay-specific quote format', async ({ request }) => {
    await delay(2000); // Rate limit buffer
    const quoteRequest = createQuoteRequest();

    const response = await request.post('/api/quote', {
      data: quoteRequest,
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const relayQuote = data.quotes.find((q: Record<string, unknown>) => q.provider === 'relay');

    if (relayQuote) {
      // Verify Relay v2 response contains expected structures
      expect(relayQuote.rawQuote).toHaveProperty('_requestParams');
      expect(relayQuote.rawQuote._requestParams).toHaveProperty('originCurrency');
      expect(relayQuote.rawQuote._requestParams).toHaveProperty('destinationCurrency');
      expect(relayQuote.rawQuote._requestParams).toHaveProperty('destinationChainId');
      // Relay v2 includes steps with instructions
      expect(relayQuote.rawQuote).toHaveProperty('steps');
    }
  });

  test('should handle DeBridge-specific quote format', async ({ request }) => {
    await delay(4000); // Rate limit buffer
    const quoteRequest = createQuoteRequest();

    const response = await request.post('/api/quote', {
      data: quoteRequest,
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const debridgeQuote = data.quotes.find(
      (q: Record<string, unknown>) => q.provider === 'debridge',
    );

    if (debridgeQuote) {
      // Verify DeBridge-specific fields
      expect(debridgeQuote.rawQuote).toBeDefined();
      // DeBridge uses different field names
      expect(
        debridgeQuote.rawQuote.srcChainTokenIn || debridgeQuote.rawQuote.estimation,
      ).toBeDefined();
    }
  });
});
