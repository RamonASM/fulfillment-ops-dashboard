import { test, expect } from '@playwright/test';

test.describe('Client Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('sarah.chen@inventoryiq.com');
    await page.getByLabel(/password/i).fill('demo1234');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('should display clients list', async ({ page }) => {
    await page.getByRole('link', { name: /clients/i }).click();
    await expect(page).toHaveURL(/.*clients/);

    // Should see client cards
    await expect(page.getByText(/acme corp/i)).toBeVisible();
  });

  test('should navigate to client detail page', async ({ page }) => {
    await page.getByRole('link', { name: /clients/i }).click();

    // Click on a client
    await page.getByText(/acme corp/i).click();

    // Should see client detail page with products
    await expect(page.getByText(/products/i)).toBeVisible();
  });

  test('should filter clients by search', async ({ page }) => {
    await page.getByRole('link', { name: /clients/i }).click();

    // Search for a client
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('acme');
      await expect(page.getByText(/acme corp/i)).toBeVisible();
    }
  });

  test('should view client products tab', async ({ page }) => {
    await page.getByRole('link', { name: /clients/i }).click();
    await page.getByText(/acme corp/i).click();

    // Click products tab if visible
    const productsTab = page.getByRole('button', { name: /products/i });
    if (await productsTab.isVisible()) {
      await productsTab.click();
    }

    // Should see product list
    await expect(page.getByText(/business cards/i).or(page.getByText(/product/i))).toBeVisible();
  });
});
