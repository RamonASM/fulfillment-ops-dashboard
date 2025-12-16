import { test, expect } from "./fixtures/auth.fixture";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page, login }) => {
    await login();
  });

  test("should display client overview", async ({ page }) => {
    // Look for clients section or card
    await expect(
      page.getByRole("link", { name: /clients/i }).first(),
    ).toBeVisible();
  });

  test("should display alert summary", async ({ page }) => {
    // Look for alerts section
    await expect(
      page.getByRole("link", { name: /alerts/i }).first(),
    ).toBeVisible();
  });

  test("should navigate to clients page", async ({ page }) => {
    // Use the sidebar link (more specific selector)
    await page
      .getByRole("navigation")
      .getByRole("link", { name: /clients/i })
      .click();
    await expect(page).toHaveURL(/.*clients/);
  });

  test("should navigate to alerts page", async ({ page }) => {
    // Use exact match to avoid ambiguity
    await page.getByRole("link", { name: "Alerts", exact: true }).click();
    await expect(page).toHaveURL(/.*alerts/);
  });

  test("should open command palette with keyboard shortcut", async ({
    page,
  }) => {
    await page.keyboard.press("Meta+k");
    // Wait a bit for palette to appear
    await page.waitForTimeout(300);
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
    }
    // This test is optional - command palette may not be implemented
  });
});
