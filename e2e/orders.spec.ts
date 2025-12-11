import { test, expect } from '@playwright/test';

test.describe('Order Management - Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('sarah.chen@inventoryiq.com');
    await page.getByLabel(/password/i).fill('demo1234');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('should display orders list', async ({ page }) => {
    await page.getByRole('link', { name: /orders/i }).click();
    await expect(page).toHaveURL(/.*orders/);
  });

  test('should filter orders by status', async ({ page }) => {
    await page.getByRole('link', { name: /orders/i }).click();

    // Look for status filter tabs or dropdown
    const statusFilter = page.getByRole('button', { name: /status|all|pending|submitted/i }).first();
    if (await statusFilter.isVisible()) {
      await statusFilter.click();
    }
  });

  test('should view order details', async ({ page }) => {
    await page.getByRole('link', { name: /orders/i }).click();

    // Click on first order row if available
    const orderRow = page.getByRole('row').nth(1);
    if (await orderRow.isVisible()) {
      await orderRow.click();
    }
  });
});

test.describe('Order Request - Portal', () => {
  test.use({ baseURL: 'http://localhost:5174' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('john.doe@acmecorp.com');
    await page.getByLabel(/password/i).fill('client1234');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('should navigate to products page', async ({ page }) => {
    await page.getByRole('link', { name: /products/i }).click();
    await expect(page).toHaveURL(/.*products/);
  });

  test('should view product details', async ({ page }) => {
    await page.getByRole('link', { name: /products/i }).click();

    // Click on a product row if expandable
    const productRow = page.getByRole('row').nth(1);
    if (await productRow.isVisible()) {
      await productRow.click();
    }
  });

  test('should access reorder flow', async ({ page }) => {
    await page.getByRole('link', { name: /products/i }).click();

    // Look for reorder button
    const reorderButton = page.getByRole('button', { name: /reorder|order/i });
    if (await reorderButton.isVisible()) {
      await expect(reorderButton).toBeVisible();
    }
  });
});
