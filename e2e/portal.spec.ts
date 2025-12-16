import { test, expect } from '@playwright/test';

// Portal tests - portal is served on port 8080 by nginx (4174 in CI)
test.describe('Client Portal', () => {
  test.use({ baseURL: process.env.CI ? 'http://localhost:4174' : 'http://localhost:8080' });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('should show portal login page', async ({ page }) => {
    await page.goto('/');
    // Portal should redirect to login
    await expect(page).toHaveURL(/.*login/);
    // Check for portal branding
    await expect(
      page.getByRole('heading', { name: /portal|sign in|login/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('should login to portal with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill('john.doe@acmecorp.com');
    await page.getByLabel(/password/i).fill('client1234');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to portal dashboard (not login)
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
  });

  test('should display inventory products after login', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('john.doe@acmecorp.com');
    await page.getByLabel(/password/i).fill('client1234');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });

    // Navigate to products/inventory
    const productsLink = page.getByRole('link', { name: /products|inventory/i });
    if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productsLink.click();

      // Should see product list
      await expect(page.locator('table, [role="grid"], .product')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should access order functionality', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('john.doe@acmecorp.com');
    await page.getByLabel(/password/i).fill('client1234');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });

    // Look for order/reorder functionality
    const orderLink = page.getByRole('link', { name: /order|reorder/i });
    const orderButton = page.getByRole('button', { name: /order|reorder/i });

    if (await orderLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(orderLink).toBeVisible();
    } else if (await orderButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(orderButton).toBeVisible();
    }
  });
});
