import { expect, test } from '@playwright/test';

test.describe('DeepCut smoke', () => {
  test('serves renderer shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toHaveCount(1);
  });

  test('loads JavaScript bundle tags', async ({ page }) => {
    await page.goto('/');
    const scripts = page.locator('script[type="module"]');
    await expect(scripts).toHaveCount(1);
  });
});
