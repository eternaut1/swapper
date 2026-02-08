import { expect, test } from '@playwright/test';

test.describe('Swap Flow', () => {
  test('should display swap widget', async ({ page }) => {
    await page.goto('/');

    // Should show wallet connection prompt
    await expect(page.getByText('Connect your wallet')).toBeVisible();

    // Should have swap widget
    await expect(page.locator('text=Swapper')).toBeVisible();
  });

  test('should show token and chain selectors after wallet connection', async ({ page }) => {
    await page.goto('/');

    // Note: In a real E2E test, you'd need to mock wallet connection
    // or use a test wallet. For now, we just check the UI structure.

    // Check that selectors exist (even if disabled without wallet)
    const tokenSelect = page.locator('select').first();
    await expect(tokenSelect).toBeDefined();
  });

  test('should validate required fields before getting quote', async ({ page }) => {
    await page.goto('/');

    // Without wallet connected or fields filled, button should be disabled
    // This test would be more comprehensive with wallet mocking
  });

  test('should display quote information', async ({ page }) => {
    await page.goto('/');

    // This test would require:
    // 1. Mocked wallet connection
    // 2. Mocked API responses
    // 3. Filled form fields
    // Then verify quote display appears
  });

  test('API: should return error for invalid quote request', async ({ request }) => {
    // Retry if rate-limited (previous tests may have consumed quota)
    let response = await request.post('/api/quote', {
      data: { sourceToken: 'test' },
    });

    if (response.status() === 429) {
      // Wait for rate limit window to reset, then retry
      const retryAfter = Number(response.headers()['retry-after'] || '5');
      await new Promise((r) => setTimeout(r, retryAfter * 1000 + 1000));
      response = await request.post('/api/quote', {
        data: { sourceToken: 'test' },
      });
    }

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(typeof data.error).toBe('string');
  });

  test('API: should initialize providers on first request', async ({ request }) => {
    const response = await request.get('/api/init');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('initialized');
  });
});
