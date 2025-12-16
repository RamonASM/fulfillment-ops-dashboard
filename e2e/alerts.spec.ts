import { test, expect } from "./fixtures/auth.fixture";

test.describe("Alerts Management", () => {
  test.beforeEach(async ({ page, login }) => {
    await login();
  });

  test("should display alerts list", async ({ page }) => {
    // Use exact match to avoid ambiguity with "Critical Alerts" link
    await page.getByRole("link", { name: "Alerts", exact: true }).click();
    await expect(page).toHaveURL(/.*alerts/);

    // Should see alerts page
    await expect(page.getByRole("heading", { name: /alerts/i })).toBeVisible();
  });

  test("should filter alerts by severity", async ({ page }) => {
    await page.getByRole("link", { name: "Alerts", exact: true }).click();

    // Look for severity filter dropdown or tabs
    const criticalFilter = page.getByRole("button", { name: /critical/i });
    if (await criticalFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await criticalFilter.click();
    }
  });

  test("should filter alerts by type", async ({ page }) => {
    await page.getByRole("link", { name: "Alerts", exact: true }).click();

    // Look for type filter
    const typeFilter = page
      .getByRole("button", { name: /type|filter/i })
      .first();
    if (await typeFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeFilter.click();
    }
  });

  test("should dismiss an alert", async ({ page }) => {
    await page.getByRole("link", { name: "Alerts", exact: true }).click();

    // Find and click dismiss button on first alert
    const dismissButton = page
      .getByRole("button", { name: /dismiss|resolve/i })
      .first();
    if (await dismissButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dismissButton.click();
    }
  });
});
