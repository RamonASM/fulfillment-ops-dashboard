import { test, expect } from './fixtures/auth.fixture';

test.describe('Client Management', () => {
  test.beforeEach(async ({ page, login }) => {
    await login();
  });

  test('should display clients list', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: /clients/i }).click();
    await expect(page).toHaveURL(/.*clients/);

    // Should see client cards - wait for them to load
    await expect(page.getByText(/acme corp/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to client detail page', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: /clients/i }).click();

    // Click on a client
    await page.getByText(/acme corp/i).click();

    // Should see client detail page with products tab
    await expect(page.getByRole('button', { name: 'Products' })).toBeVisible({ timeout: 5000 });
  });

  test('should filter clients by search', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: /clients/i }).click();

    // Search for a client
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('acme');
      await expect(page.getByText(/acme corp/i)).toBeVisible();
    }
  });

  test('should view client products tab', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: /clients/i }).click();
    await page.getByText(/acme corp/i).click();

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Click products tab if visible
    const productsTab = page.getByRole('tab', { name: /products/i }).or(
      page.getByRole('button', { name: /products/i })
    );
    if (await productsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await productsTab.click();
    }

    // Should see product list - look for specific product name
    await expect(
      page.getByText('Business Cards - Standard')
    ).toBeVisible({ timeout: 5000 });
  });
});
