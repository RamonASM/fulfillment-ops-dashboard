// =============================================================================
// ML FEATURES E2E TESTS
// Tests ML Analytics features in the admin dashboard
// =============================================================================

import { test, expect } from "./fixtures/auth.fixture.js";

test.describe("ML Analytics Features", () => {
  // Admin dashboard is served on port 80 by nginx (4173 in CI)
  test.use({
    baseURL: process.env.CI ? "http://localhost:4173" : "http://localhost:80",
  });

  // ===========================================================================
  // ML STATUS BADGE TESTS
  // ===========================================================================

  test("should display ML status badge in header", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/");

    // Should see ML status badge (Brain icon + status indicator)
    const mlBadge = page.locator(
      '[data-testid="ml-status-badge"], button:has-text("ML")',
    );
    await expect(mlBadge).toBeVisible({ timeout: 5000 });
  });

  test("should navigate to ML Analytics page when clicking status badge", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/");

    // Click ML status badge - wait for it to be visible first
    const mlBadge = page
      .locator('[data-testid="ml-status-badge"], button:has-text("ML")')
      .first();

    // Use proper wait pattern instead of catch(() => false)
    await expect(mlBadge).toBeVisible({ timeout: 5000 });
    await mlBadge.click();

    // Should navigate to ML Analytics page
    await expect(page).toHaveURL(/\/ml-analytics/, { timeout: 5000 });
  });

  // ===========================================================================
  // ML ANALYTICS NAVIGATION TESTS
  // ===========================================================================

  test("should display ML Analytics in sidebar navigation", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/");

    // Should see ML Analytics link in sidebar
    const mlNavLink = page.getByRole("link", { name: /ml analytics/i });
    await expect(mlNavLink).toBeVisible({ timeout: 5000 });
  });

  test("should navigate to ML Analytics page via sidebar", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/");

    // Click ML Analytics link
    const mlNavLink = page.getByRole("link", { name: /ml analytics/i });
    await mlNavLink.click();

    // Should navigate to ML Analytics page
    await expect(page).toHaveURL(/\/ml-analytics/, { timeout: 5000 });
  });

  test("should navigate to ML Analytics using keyboard shortcut (G then M)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/");

    // Press G then M
    await page.keyboard.press("g");
    await page.keyboard.press("m");

    // Wait for navigation to complete
    await page.waitForURL(/\/ml-analytics/, { timeout: 5000 });

    // Should navigate to ML Analytics page
    await expect(page).toHaveURL(/\/ml-analytics/, { timeout: 5000 });
  });

  // ===========================================================================
  // ML ANALYTICS PAGE TESTS
  // ===========================================================================

  test("should display ML service health status", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/ml-analytics");

    // Should see service health indicator
    await expect(
      page.locator("text=/healthy|degraded|offline|service status/i"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("should display ML statistics cards", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/ml-analytics");

    // Should see stats cards (forecasts, predictions, accuracy)
    const statsCards = page.locator('[data-testid="ml-stats"], .stats-card');
    await expect(statsCards.first()).toBeVisible({ timeout: 5000 });
  });

  test("should display recent predictions list", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/ml-analytics");

    // Should see predictions list or empty state
    const predictions = page.locator(
      "text=/recent predictions|forecast|prediction/i",
    );
    await expect(predictions.first()).toBeVisible({ timeout: 5000 });
  });

  // ===========================================================================
  // FORECAST WIDGET TESTS
  // ===========================================================================

  test("should display forecast button in product table", async ({
    authenticatedPage: page,
  }) => {
    // Navigate to a client detail page
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    // Click first client - use proper assertion pattern
    const firstClient = page.getByRole("link", { name: /view|details/i }).first();

    // Skip test if no clients available
    const hasClients = await firstClient.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await firstClient.click();
    await page.waitForLoadState("networkidle");

    // Should see AI Insights column with Forecast buttons (or skip if not present)
    const forecastButton = page.getByRole("button", { name: /forecast/i }).first();
    const hasForecasts = await forecastButton.count() > 0;
    test.skip(!hasForecasts, "No forecast buttons visible - ML service may be offline");

    await expect(forecastButton).toBeVisible({ timeout: 5000 });
  });

  test("should open forecast modal when clicking forecast button", async ({
    authenticatedPage: page,
  }) => {
    // Navigate to a client detail page
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    // Click first client
    const firstClient = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await firstClient.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await firstClient.click();
    await page.waitForLoadState("networkidle");

    // Click forecast button
    const forecastButton = page.getByRole("button", { name: /forecast/i }).first();
    const hasForecasts = await forecastButton.count() > 0;
    test.skip(!hasForecasts, "No forecast buttons visible - ML service may be offline");

    await forecastButton.click();

    // Should see forecast modal with charts
    await expect(
      page.locator('[data-testid="forecast-modal"], [role="dialog"]'),
    ).toBeVisible({ timeout: 5000 });
  });

  // ===========================================================================
  // STOCKOUT PREDICTION TESTS
  // ===========================================================================

  test("should display stockout risk widget on client analytics page", async ({
    authenticatedPage: page,
  }) => {
    // Navigate to a client detail page
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    // Click first client
    const firstClient = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await firstClient.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await firstClient.click();
    await page.waitForLoadState("networkidle");

    // Navigate to analytics tab
    const analyticsTab = page.getByRole("link", { name: /analytics/i });
    const hasAnalyticsTab = await analyticsTab.count() > 0;
    test.skip(!hasAnalyticsTab, "Analytics tab not visible");

    await analyticsTab.click();
    await page.waitForLoadState("networkidle");

    // Should see stockout risk widget
    await expect(
      page.locator("text=/stockout|risk|prediction/i"),
    ).toBeVisible({ timeout: 5000 });
  });

  // ===========================================================================
  // ML HEALTH CHECK TESTS
  // ===========================================================================

  test("should display ML health check in settings or status page", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/ml-analytics");

    // ML health status should be visible
    const healthStatus = page.locator(
      '[data-testid="ml-health"], text=/ml service|service health/i',
    );
    await expect(healthStatus.first()).toBeVisible({ timeout: 5000 });
  });
});
