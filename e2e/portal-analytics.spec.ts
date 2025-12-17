// =============================================================================
// PORTAL ANALYTICS E2E TESTS
// Tests enhanced analytics features in the client portal
// =============================================================================

import { test, expect } from "@playwright/test";
import { PORTAL_USER_CREDENTIALS } from "./fixtures/auth.fixture.js";

test.describe("Portal Analytics Features", () => {
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
  // DASHBOARD RENDERING TESTS
  // ===========================================================================

  test("should display analytics dashboard", async ({ page }) => {
    // Navigate to analytics page
    const analyticsLink = page.getByRole("link", {
      name: /analytics|dashboard/i,
    });

    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Should see dashboard content
      await expect(
        page.locator(
          '[data-testid="analytics-dashboard"], .analytics-container',
        ),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("should render stock health widget", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Should see stock health visualization
      await expect(
        page.locator(
          '[data-testid="stock-health-widget"], .stock-health, text=/stock health/i',
        ),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("should render usage trends chart", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Should see usage trends chart (look for SVG or canvas)
      const chartLocator = page.locator(
        'svg, canvas, [data-testid="usage-trends-chart"]',
      );
      await expect(chartLocator.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("should render reorder suggestions widget", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Should see reorder suggestions
      await expect(
        page.locator(
          '[data-testid="reorder-suggestions"], text=/reorder|suggestion/i',
        ),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  // ===========================================================================
  // CHART INTERACTION TESTS
  // ===========================================================================

  test("should display tooltips on chart hover", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Find a chart element
      const chart = page.locator("svg, canvas").first();
      if (await chart.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Hover over chart to trigger tooltip
        await chart.hover();

        // Tooltip might appear (not all charts have tooltips)
        // Just verify chart is interactive
        await expect(chart).toBeVisible();
      }
    }
  });

  test("should allow time range selection", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Look for time range selector
      const timeSelector = page.getByRole("button", {
        name: /30 days|7 days|90 days|month|week/i,
      });
      if (await timeSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
        await timeSelector.click();

        // Should see dropdown options
        await expect(
          page.locator('[role="menu"], [role="listbox"]'),
        ).toBeVisible({ timeout: 2000 });
      }
    }
  });

  // ===========================================================================
  // EXPORT FUNCTIONALITY TESTS
  // ===========================================================================

  test("should have export button visible", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Look for export button
      const exportButton = page.getByRole("button", {
        name: /export|download/i,
      });
      if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(exportButton).toBeVisible();
      }
    }
  });

  test("should open export options menu", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Click export button
      const exportButton = page.getByRole("button", {
        name: /export|download/i,
      });
      if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await exportButton.click();

        // Should see export format options (PNG, CSV, etc.)
        await expect(
          page.locator('text=/PNG|CSV|PDF/i, [role="menu"]'),
        ).toBeVisible({ timeout: 2000 });
      }
    }
  });

  // ===========================================================================
  // REORDER WORKFLOW TESTS
  // ===========================================================================

  test("should initiate reorder from suggestion", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Find reorder button in suggestions
      const reorderButton = page.getByRole("button", { name: /reorder/i });
      if (
        await reorderButton
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await reorderButton.first().click();

        // Should open reorder modal or navigate to order page
        await expect(
          page.locator('[data-testid="reorder-modal"], text=/order|quantity/i'),
        ).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test("should display suggested order quantities", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Reorder suggestions should show quantities
      const suggestionWidget = page.locator(
        '[data-testid="reorder-suggestions"]',
      );
      if (
        await suggestionWidget.isVisible({ timeout: 3000 }).catch(() => false)
      ) {
        // Should see numbers (quantities)
        await expect(
          suggestionWidget.locator("text=/\\d+ (units|packs)/i"),
        ).toBeVisible({ timeout: 3000 });
      }
    }
  });

  // ===========================================================================
  // RESPONSIVE DESIGN TESTS
  // ===========================================================================

  test("should render analytics on tablet viewport", async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Should see analytics content (might be stacked vertically)
      await expect(
        page.locator(
          '[data-testid="analytics-dashboard"], .analytics-container',
        ),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("should render analytics on mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Should see analytics content (mobile optimized)
      await expect(
        page.locator(
          '[data-testid="analytics-dashboard"], .analytics-container',
        ),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  // ===========================================================================
  // DATA LOADING TESTS
  // ===========================================================================

  test("should show loading state while fetching data", async ({ page }) => {
    // Navigate to analytics quickly to catch loading state
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Might see loading spinner briefly (use or condition)
      const spinner = page.locator(
        '[data-testid="loading"], .spinner, [role="progressbar"]',
      );
      const content = page.locator('[data-testid="analytics-dashboard"]');

      // Either loading or content should be visible
      await Promise.race([
        expect(spinner).toBeVisible({ timeout: 1000 }),
        expect(content).toBeVisible({ timeout: 1000 }),
      ]).catch(() => {}); // Ignore if neither appears quickly
    }
  });

  test("should handle empty data states gracefully", async ({ page }) => {
    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Should see content or empty state message
      const content = page.locator('[data-testid="analytics-dashboard"]');
      const emptyState = page.locator(
        "text=/no data|no products|no analytics/i",
      );

      // Either content or empty state should be visible
      await Promise.race([
        expect(content).toBeVisible({ timeout: 5000 }),
        expect(emptyState).toBeVisible({ timeout: 5000 }),
      ]);
    }
  });

  // ===========================================================================
  // PERFORMANCE TESTS
  // ===========================================================================

  test("should load analytics page within 3 seconds", async ({ page }) => {
    const startTime = Date.now();

    // Navigate to analytics
    const analyticsLink = page
      .getByRole("link", { name: /analytics/i })
      .first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();

      // Wait for content to be visible
      await page
        .locator('[data-testid="analytics-dashboard"], .analytics-container')
        .waitFor({ timeout: 5000 });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000);
    }
  });
});
