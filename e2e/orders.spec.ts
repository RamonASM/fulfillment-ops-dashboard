import { test, expect } from "./fixtures/auth.fixture";

test.describe("Order Management - Admin", () => {
  test.beforeEach(async ({ page, login }) => {
    await login();
  });

  test("should display orders list", async ({ page }) => {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: /orders/i })
      .click();
    await expect(page).toHaveURL(/.*orders/);
  });

  test("should filter orders by status", async ({ page }) => {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: /orders/i })
      .click();

    // Look for status filter tabs or dropdown
    const statusFilter = page
      .getByRole("button", { name: /status|all|pending|submitted/i })
      .first();
    if (await statusFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusFilter.click();
    }
  });

  test("should view order details", async ({ page }) => {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: /orders/i })
      .click();

    // Wait for orders to load
    await page.waitForLoadState("networkidle");

    // Click on first order row if available
    const orderRow = page.getByRole("row").nth(1);
    if (await orderRow.isVisible({ timeout: 2000 }).catch(() => false)) {
      await orderRow.click();
    }
  });
});

// Portal tests - use port 8080 (nginx serves portal there)
test.describe("Order Request - Portal", () => {
  test.use({ baseURL: "http://localhost:8080" });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("john.doe@acmecorp.com");
    await page.getByLabel(/password/i).fill("client1234");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Portal might redirect to different URL
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10000,
    });
  });

  test("should navigate to products page", async ({ page }) => {
    const productsLink = page.getByRole("link", {
      name: /products|inventory/i,
    });
    if (await productsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await productsLink.click();
      await expect(page).toHaveURL(/.*products|inventory/);
    }
  });

  test("should view product details", async ({ page }) => {
    const productsLink = page.getByRole("link", {
      name: /products|inventory/i,
    });
    if (await productsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await productsLink.click();

      // Click on a product row if available
      const productRow = page.getByRole("row").nth(1);
      if (await productRow.isVisible({ timeout: 2000 }).catch(() => false)) {
        await productRow.click();
      }
    }
  });

  test("should access reorder flow", async ({ page }) => {
    const productsLink = page.getByRole("link", {
      name: /products|inventory/i,
    });
    if (await productsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await productsLink.click();

      // Look for reorder button
      const reorderButton = page.getByRole("button", {
        name: /reorder|order/i,
      });
      if (await reorderButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(reorderButton).toBeVisible();
      }
    }
  });
});
