import { test, expect } from '@playwright/test';

test.describe('Client Portal', () => {
  test.use({ baseURL: 'http://localhost:5174' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show portal login page', async ({ page }) => {
    await expect(page).toHaveURL(/.*login/);
    await expect(page.getByRole('heading', { name: /client portal/i })).toBeVisible();
  });

  test('should login to portal with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill('john.doe@acmecorp.com');
    await page.getByLabel(/password/i).fill('client1234');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to portal dashboard
    await expect(page).toHaveURL('/');
    await expect(page.getByText(/dashboard/i)).toBeVisible();
  });

  test('should display inventory products after login', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('john.doe@acmecorp.com');
    await page.getByLabel(/password/i).fill('client1234');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Navigate to products
    await page.getByRole('link', { name: /products/i }).click();
    await expect(page).toHaveURL(/.*products/);

    // Should see product list
    await expect(page.getByText(/business cards/i)).toBeVisible();
  });

  test('should create order request', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('john.doe@acmecorp.com');
    await page.getByLabel(/password/i).fill('client1234');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Navigate to products and select items
    await page.getByRole('link', { name: /products/i }).click();

    // Select a product (click checkbox)
    await page.locator('input[type="checkbox"]').first().check();

    // Click reorder button
    await page.getByRole('button', { name: /reorder/i }).click();

    // Should navigate to order request page
    await expect(page).toHaveURL(/.*order/);
  });
});
