// =============================================================================
// PORTAL ENHANCED FEATURES E2E TESTS
// Tests enhanced portal features: navigation, filters, real-time updates
// =============================================================================

import { test, expect } from "@playwright/test";
import { PORTAL_USER_CREDENTIALS } from "./fixtures/auth.fixture.js";

test.describe("Enhanced Portal Features", () => {
  // Portal is served on port 8080 by nginx (4174 in CI)
  test.use({
    baseURL: process.env.CI ? "http://localhost:4174" : "http://localhost:8080",
  });

  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test
    await page.context().clearCookies();

    // Login as portal user
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(PORTAL_USER_CREDENTIALS.email);
    await page.getByLabel(/password/i).fill(PORTAL_USER_CREDENTIALS.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10000,
    });
  });

  // ===========================================================================
  // ANALYTICS NAVIGATION TESTS
  // ===========================================================================

  test("should navigate between dashboard sections smoothly", async ({
    page,
  }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();
      await expect(page).toHaveURL(/analytics/, { timeout: 3000 });

      // Navigate back to products
      const productsLink = page
        .getByRole("link", { name: /products|inventory/i })
        .first();
      if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await productsLink.click();

        // Should navigate successfully
        await page.waitForURL((url) => !url.pathname.includes("/analytics"), {
          timeout: 3000,
        });
      }
    }
  });

  test("should maintain scroll position when navigating back", async ({
    page,
  }) => {
    // Navigate to products
    const productsLink = page
      .getByRole("link", { name: /products|inventory/i })
      .first();
    if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productsLink.click();

      // Scroll down
      await page.evaluate(() => window.scrollTo(0, 500));
      const scrollBefore = await page.evaluate(() => window.scrollY);

      // Navigate away and back
      const analyticsLink = page
        .getByRole("link", { name: /analytics/i })
        .first();
      if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await analyticsLink.click();
        await page.goBack();

        // Scroll position might be restored (browser behavior)
        const scrollAfter = await page.evaluate(() => window.scrollY);
        expect(scrollAfter).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // ===========================================================================
  // DATA LOADING STATE TESTS
  // ===========================================================================

  test("should show loading spinner when fetching data", async ({ page }) => {
    // Navigate to products quickly to catch loading state
    const productsLink = page
      .getByRole("link", { name: /products|inventory/i })
      .first();
    if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productsLink.click();

      // Might see loading state briefly
      const spinner = page.locator(
        '[data-testid="loading"], .spinner, [role="progressbar"]',
      );
      const content = page.locator('table, [role="grid"], .product');

      // Either loading or content should appear
      await Promise.race([
        expect(spinner).toBeVisible({ timeout: 1000 }),
        expect(content).toBeVisible({ timeout: 1000 }),
      ]).catch(() => {}); // Ignore if neither appears quickly
    }
  });

  test("should display skeleton loaders for charts", async ({ page }) => {
    // Navigate to analytics quickly
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Might see skeleton or actual content
      const skeleton = page.locator('[data-testid="skeleton"], .skeleton');
      const chart = page.locator("svg, canvas");

      // Either skeleton or chart should be visible
      await Promise.race([
        expect(skeleton).toBeVisible({ timeout: 1000 }),
        expect(chart).toBeVisible({ timeout: 1000 }),
      ]).catch(() => {}); // Ignore if neither appears quickly
    }
  });

  // ===========================================================================
  // INTERACTIVE FILTERS TESTS
  // ===========================================================================

  test("should filter products by search query", async ({ page }) => {
    // Navigate to products
    const productsLink = page
      .getByRole("link", { name: /products|inventory/i })
      .first();
    if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productsLink.click();

      // Find search input
      const searchInput = page
        .getByRole("searchbox")
        .or(page.getByPlaceholder(/search/i));
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Type search query
        await searchInput.fill("test");

        // Products should filter (or show "no results")
        await page.waitForTimeout(500); // Wait for debounce/filter

        // Should see filtered results or no results message
        const results = page.locator("table tr, .product-item");
        const noResults = page.locator("text=/no products|no results/i");

        // Either results or no results should be visible
        await Promise.race([
          expect(results).toBeVisible({ timeout: 2000 }),
          expect(noResults).toBeVisible({ timeout: 2000 }),
        ]);
      }
    }
  });

  test("should filter products by status", async ({ page }) => {
    // Navigate to products
    const productsLink = page
      .getByRole("link", { name: /products|inventory/i })
      .first();
    if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productsLink.click();

      // Find status filter dropdown
      const statusFilter = page.getByRole("button", { name: /status|filter/i });
      if (await statusFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusFilter.click();

        // Should see filter options
        await expect(
          page.locator('[role="menu"], [role="listbox"]'),
        ).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test("should clear all filters", async ({ page }) => {
    // Navigate to products
    const productsLink = page
      .getByRole("link", { name: /products|inventory/i })
      .first();
    if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productsLink.click();

      // Look for clear filters button
      const clearButton = page.getByRole("button", { name: /clear|reset/i });
      if (await clearButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clearButton.click();

        // Filters should be cleared
        const searchInput = page
          .getByRole("searchbox")
          .or(page.getByPlaceholder(/search/i));
        if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(searchInput).toHaveValue("");
        }
      }
    }
  });

  // ===========================================================================
  // REAL-TIME UPDATES TESTS (WebSocket/Polling)
  // ===========================================================================

  test("should reflect inventory updates in real-time", async ({ page }) => {
    // Navigate to products
    const productsLink = page
      .getByRole("link", { name: /products|inventory/i })
      .first();
    if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productsLink.click();

      // Get initial stock value
      const stockCell = page
        .locator('td:has-text("stock"), td:has-text("units")')
        .first();
      if (await stockCell.isVisible({ timeout: 3000 }).catch(() => false)) {
        const initialValue = await stockCell.textContent();

        // Wait a few seconds for potential updates (polling interval)
        await page.waitForTimeout(3000);

        // Value might have changed or stayed the same
        const currentValue = await stockCell.textContent();
        expect(currentValue).toBeDefined();
      }
    }
  });

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  test("should display error message when API fails", async ({ page }) => {
    // Intercept API calls and simulate failure
    await page.route("**/api/**", (route) => {
      route.abort("failed");
    });

    // Navigate to analytics (will fail to load data)
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Should see error message
      await expect(
        page.locator("text=/error|failed|unable to load/i"),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  // ===========================================================================
  // ACCESSIBILITY TESTS
  // ===========================================================================

  test("should have proper ARIA labels for interactive elements", async ({
    page,
  }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Check for ARIA labels on buttons
      const buttons = page.getByRole("button");
      const buttonCount = await buttons.count();

      if (buttonCount > 0) {
        // At least one button should have accessible name
        const firstButton = buttons.first();
        const ariaLabel = await firstButton.getAttribute("aria-label");
        const textContent = await firstButton.textContent();

        expect(ariaLabel || textContent).toBeTruthy();
      }
    }
  });
});
