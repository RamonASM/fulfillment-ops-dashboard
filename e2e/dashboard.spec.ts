import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('sarah.chen@inventoryiq.com');
    await page.getByLabel(/password/i).fill('demo1234');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('should display client overview', async ({ page }) => {
    await expect(page.getByText(/clients/i)).toBeVisible();
    // Check for at least one client card
    await expect(page.getByText(/acme/i)).toBeVisible();
  });

  test('should display alert summary', async ({ page }) => {
    await expect(page.getByText(/alerts/i)).toBeVisible();
  });

  test('should navigate to clients page', async ({ page }) => {
    await page.getByRole('link', { name: /clients/i }).click();
    await expect(page).toHaveURL(/.*clients/);
  });

  test('should navigate to alerts page', async ({ page }) => {
    await page.getByRole('link', { name: /alerts/i }).click();
    await expect(page).toHaveURL(/.*alerts/);
  });

  test('should open command palette with keyboard shortcut', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
  });
});
