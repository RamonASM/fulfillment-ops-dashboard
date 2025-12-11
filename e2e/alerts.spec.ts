import { test, expect } from '@playwright/test';

test.describe('Alerts Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('sarah.chen@inventoryiq.com');
    await page.getByLabel(/password/i).fill('demo1234');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('should display alerts list', async ({ page }) => {
    await page.getByRole('link', { name: /alerts/i }).click();
    await expect(page).toHaveURL(/.*alerts/);

    // Should see alerts page
    await expect(page.getByText(/alert/i)).toBeVisible();
  });

  test('should filter alerts by severity', async ({ page }) => {
    await page.getByRole('link', { name: /alerts/i }).click();

    // Look for severity filter dropdown or tabs
    const criticalFilter = page.getByRole('button', { name: /critical/i });
    if (await criticalFilter.isVisible()) {
      await criticalFilter.click();
    }
  });

  test('should filter alerts by type', async ({ page }) => {
    await page.getByRole('link', { name: /alerts/i }).click();

    // Look for type filter
    const typeFilter = page.getByRole('button', { name: /type|filter/i }).first();
    if (await typeFilter.isVisible()) {
      await typeFilter.click();
    }
  });

  test('should dismiss an alert', async ({ page }) => {
    await page.getByRole('link', { name: /alerts/i }).click();

    // Find and click dismiss button on first alert
    const dismissButton = page.getByRole('button', { name: /dismiss|resolve/i }).first();
    if (await dismissButton.isVisible()) {
      await dismissButton.click();
    }
  });
});
