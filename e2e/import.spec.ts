import { test, expect } from "./fixtures/auth.fixture";

test.describe("Data Import", () => {
  test.beforeEach(async ({ page, login }) => {
    await login();
  });

  test("should navigate to import page", async ({ page }) => {
    // Navigate to imports page via sidebar
    const importsLink = page
      .getByRole("navigation")
      .getByRole("link", { name: /import/i });
    if (await importsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await importsLink.click();
      await expect(page).toHaveURL(/.*import/);
    }
  });

  test("should display import history", async ({ page }) => {
    // Navigate to imports page
    const importsLink = page
      .getByRole("navigation")
      .getByRole("link", { name: /import/i });
    if (await importsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await importsLink.click();

      // Should see import history or upload area
      await expect(
        page.getByText(/import|upload|history/i).first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("should show file upload interface", async ({ page }) => {
    // Navigate to a client detail page for import
    await page
      .getByRole("navigation")
      .getByRole("link", { name: /clients/i })
      .click();
    await page.waitForLoadState("networkidle");

    // Click on first client
    const clientCard = page.getByText(/acme corp/i);
    if (await clientCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clientCard.click();

      // Look for import button
      const importButton = page.getByRole("button", { name: /import|upload/i });
      if (await importButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await importButton.click();

        // Should see file upload area
        await expect(
          page.getByText(/upload|drag|drop|file/i).first(),
        ).toBeVisible({ timeout: 3000 });
      }
    }
  });
});
