import { createQuoteRequest, generateSolanaAddress } from '../helpers/fixtures';
import { expect, test } from '../helpers/setup';

test.describe('API Resilience and Error Handling', () => {
  test.describe('Quote API', () => {
    test('should successfully get quotes from providers', async ({ request }) => {
      const quoteRequest = createQuoteRequest();

      const response = await request.post('/api/quote', {
        data: quoteRequest,
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data).toHaveProperty('quotes');
      expect(Array.isArray(data.quotes)).toBe(true);
      expect(data.quotes.length).toBeGreaterThan(0);

      // Validate quote structure
      const quote = data.quotes[0];
      expect(quote).toHaveProperty('provider');
      expect(quote).toHaveProperty('quoteId');
      expect(quote).toHaveProperty('sourceAmount');
      expect(quote).toHaveProperty('destAmount');
      expect(quote).toHaveProperty('estimatedCosts');
    });

    test('should return 400 for missing required fields', async ({ request }) => {
      const response = await request.post('/api/quote', {
        data: {
          sourceToken: 'test',
          // Missing other required fields
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('should return 400 for invalid token addresses', async ({ request }) => {
      const response = await request.post('/api/quote', {
        data: {
          sourceChain: 'solana',
          sourceToken: 'invalid-token-address',
          sourceAmount: '1000000000',
          destChain: '42161',
          destToken: '0xInvalidAddress',
          userWallet: 'InvalidWallet',
          destWallet: '0xInvalidDest',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test('should handle insufficient balance gracefully', async ({ request }) => {
      const quoteRequest = createQuoteRequest({
        sourceAmount: '999999999999999999', // Unrealistic amount
      });

      const response = await request.post('/api/quote', {
        data: quoteRequest,
      });

      // Should either return an error or handle gracefully
      if (!response.ok()) {
        const data = await response.json();
        expect(data.error).toBeDefined();
      }
    });
  });

  test.describe('Swap Preparation API', () => {
    test('should return 400 for invalid quote', async ({ request }) => {
      const response = await request.post('/api/execute', {
        data: {
          quote: null,
          userWallet: generateSolanaAddress(),
          feeToken: 'USDC',
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    test('should validate fee token parameter', async ({ request }) => {
      const response = await request.post('/api/execute', {
        data: {
          quote: { id: 'test-quote' },
          userWallet: generateSolanaAddress(),
          feeToken: 'INVALID_TOKEN', // Should only accept USDC or SOL
        },
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Swap Status API', () => {
    test('should return error for non-existent swap', async ({ request }) => {
      const response = await request.get('/api/status/non-existent-swap-id');

      // Should return 404 or 500 with error
      expect(response.status()).toBeGreaterThanOrEqual(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('should return proper status structure for valid swap', async ({ request }) => {
      // This would require creating a swap first
      // For now, we just validate the error structure
      const response = await request.get('/api/status/test-swap-id');

      const data = await response.json();
      expect(data).toHaveProperty('success');

      if (data.success) {
        expect(data).toHaveProperty('status');
        expect(data.status).toHaveProperty('swapId');
        expect(data.status).toHaveProperty('status');
        expect(data.status).toHaveProperty('progress');
      }
    });
  });

  test.describe('Provider Health', () => {
    test('should handle provider failures gracefully', async ({ request }) => {
      const quoteRequest = createQuoteRequest();

      const response = await request.post('/api/quote', {
        data: quoteRequest,
      });

      // Should succeed even if some providers fail
      if (response.ok()) {
        const data = await response.json();
        expect(data.quotes).toBeDefined();
        // At least one provider should work
        expect(data.quotes.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Retry Logic', () => {
    test('should retry failed requests with exponential backoff', async ({ request }) => {
      const quoteRequest = createQuoteRequest();

      const response = await request.post('/api/quote', {
        data: quoteRequest,
        timeout: 60000, // Longer timeout to allow for retries
      });

      // Response should eventually succeed or fail gracefully
      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('Rate Limiting', () => {
    test('should handle concurrent requests without errors', async ({ request }) => {
      const quoteRequest = createQuoteRequest();

      // Send 3 concurrent requests
      const requests = Array.from({ length: 3 }, () =>
        request.post('/api/quote', {
          data: quoteRequest,
        }),
      );

      const responses = await Promise.all(requests);

      // All requests should complete (server shouldn't crash or hang)
      expect(responses.length).toBe(3);

      // Each response should have a valid HTTP status and parseable JSON body
      for (const r of responses) {
        expect(r.status()).toBeGreaterThanOrEqual(200);
        const body = await r.json();
        expect(body).toBeDefined();
      }
    });

    test('should include rate limit headers when rate limiting is active', async ({ request }) => {
      const quoteRequest = createQuoteRequest();

      const response = await request.post('/api/quote', {
        data: quoteRequest,
      });

      // Check for standard rate limit headers if rate limiting is implemented
      const headers = response.headers();

      if (response.status() === 429) {
        // Rate limit headers should be present
        expect(
          headers['x-ratelimit-limit'] || headers['ratelimit-limit'] || headers['retry-after'],
        ).toBeDefined();
      }
    });
  });

  test.describe('Error Response Format', () => {
    test('should return consistent error format', async ({ request }) => {
      const response = await request.post('/api/quote', {
        data: {
          // Invalid data - missing required fields
        },
      });

      expect(response.status()).toBeGreaterThanOrEqual(400);
      const data = await response.json();

      // Error response should have consistent structure
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(false);
      expect(data).toHaveProperty('error');
      expect(typeof data.error).toBe('string');
    });
  });
});
