import { test as base, expect, Page } from "@playwright/test";

// =============================================================================
// SHARED AUTHENTICATION FIXTURE
// =============================================================================
// Provides consistent login/logout functionality across all E2E tests.
// Reduces code duplication and ensures consistent auth state.
// =============================================================================

export interface AuthCredentials {
  email: string;
  password: string;
}

// Default admin credentials
export const DEFAULT_ADMIN_CREDENTIALS: AuthCredentials = {
  email: "sarah.chen@inventoryiq.com",
  password: "demo1234",
};

// Portal user credentials
export const PORTAL_USER_CREDENTIALS: AuthCredentials = {
  email: "john.doe@acmecorp.com",
  password: "client1234",
};

/**
 * Login helper function - can be used standalone or via fixture
 */
export async function login(
  page: Page,
  credentials: AuthCredentials = DEFAULT_ADMIN_CREDENTIALS,
) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for redirect to dashboard
  await expect(page).toHaveURL("/", { timeout: 10000 });
}

/**
 * Logout helper function
 */
export async function logout(page: Page) {
  // Click user menu and logout
  const userMenu = page
    .getByRole("button", { name: /user|profile|account/i })
    .first();
  if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
    await userMenu.click();
    const logoutButton = page.getByRole("menuitem", {
      name: /log ?out|sign ?out/i,
    });
    if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await logoutButton.click();
    }
  }
  await page.context().clearCookies();
}

// =============================================================================
// TEST FIXTURE EXTENSION
// =============================================================================

type AuthFixtures = {
  /** Auto-logs in as admin user before test, clears cookies after */
  authenticatedPage: Page;
  /** Login helper - call manually when you need custom credentials */
  login: (credentials?: AuthCredentials) => Promise<void>;
  /** Logout helper */
  logout: () => Promise<void>;
};

/**
 * Extended test fixture with authentication helpers
 */
export const test = base.extend<AuthFixtures>({
  // Auto-authenticated page - logs in before test runs
  authenticatedPage: async ({ page }, use) => {
    await login(page, DEFAULT_ADMIN_CREDENTIALS);
    await use(page);
    await page.context().clearCookies();
  },

  // Manual login helper
  login: async ({ page }, use) => {
    const loginFn = async (
      credentials: AuthCredentials = DEFAULT_ADMIN_CREDENTIALS,
    ) => {
      await login(page, credentials);
    };
    await use(loginFn);
  },

  // Logout helper
  logout: async ({ page }, use) => {
    const logoutFn = async () => {
      await logout(page);
    };
    await use(logoutFn);
  },
});

export { expect };
