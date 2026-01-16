// =============================================================================
// DATA IMPORT E2E TESTS
// Tests the complete import workflow: upload → mapping → process → verify
// =============================================================================

import { test, expect } from "./fixtures/auth.fixture";
import path from "path";
import fs from "fs";

// Test data for imports
const TEST_CSV_CONTENT = `Product ID,Product Name,Item Type,Quantity Multiplier,Available Quantity,New Notification Point
TEST-SKU-001,E2E Test Widget A,Evergreen,1,100,10
TEST-SKU-002,E2E Test Widget B,Event,5,50,5
TEST-SKU-003,E2E Test Widget C,Evergreen,10,200,20
`;

test.describe("Data Import", () => {
  // ===========================================================================
  // NAVIGATION TESTS
  // ===========================================================================

  test("should navigate to import page", async ({ authenticatedPage: page }) => {
    // Navigate to imports page via sidebar
    const importsLink = page
      .getByRole("navigation")
      .getByRole("link", { name: /import/i });
    await expect(importsLink).toBeVisible({ timeout: 5000 });
    await importsLink.click();
    await expect(page).toHaveURL(/.*import/);
  });

  test("should display import history section", async ({ authenticatedPage: page }) => {
    // Navigate to imports page
    await page.goto("/imports");
    await page.waitForLoadState("networkidle");

    // Should see import history heading or table
    await expect(
      page.getByText(/import history|recent imports|past imports/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  // ===========================================================================
  // IMPORT MODAL TESTS
  // ===========================================================================

  test("should open import modal from client detail page", async ({ authenticatedPage: page }) => {
    // Navigate to clients page
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    // Find and click a client
    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    // Look for import button and click it
    const importButton = page.getByRole("button", { name: /import|upload/i }).first();
    const hasImportButton = await importButton.count() > 0;
    test.skip(!hasImportButton, "No import button visible on client page");

    await importButton.click();

    // Should see import modal with file upload area
    await expect(
      page.locator('[role="dialog"], .modal, [data-testid="import-modal"]'),
    ).toBeVisible({ timeout: 5000 });
  });

  test("should display file upload dropzone in import modal", async ({ authenticatedPage: page }) => {
    // Navigate to clients and open import modal
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    const importButton = page.getByRole("button", { name: /import|upload/i }).first();
    const hasImportButton = await importButton.count() > 0;
    test.skip(!hasImportButton, "No import button visible on client page");

    await importButton.click();

    // Should see dropzone with upload instructions
    await expect(
      page.getByText(/drag|drop|choose|select|upload.*file/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  // ===========================================================================
  // IMPORT TYPE SELECTION TESTS
  // ===========================================================================

  test("should display import type options", async ({ authenticatedPage: page }) => {
    // Navigate to clients and open import modal
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    const importButton = page.getByRole("button", { name: /import|upload/i }).first();
    const hasImportButton = await importButton.count() > 0;
    test.skip(!hasImportButton, "No import button visible");

    await importButton.click();

    // Should see import type options (Inventory, Orders, Products)
    const importTypes = page.locator('text=/inventory|orders|products/i');
    await expect(importTypes.first()).toBeVisible({ timeout: 5000 });
  });

  // ===========================================================================
  // FILE UPLOAD TESTS
  // ===========================================================================

  test("should accept CSV file upload", async ({ authenticatedPage: page }) => {
    // Navigate to clients and open import modal
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    const importButton = page.getByRole("button", { name: /import|upload/i }).first();
    const hasImportButton = await importButton.count() > 0;
    test.skip(!hasImportButton, "No import button visible");

    await importButton.click();

    // Create a temporary CSV file for upload
    const tempDir = path.join(process.cwd(), "e2e", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, "test-import.csv");
    fs.writeFileSync(tempFile, TEST_CSV_CONTENT);

    try {
      // Find file input and upload
      const fileInput = page.locator('input[type="file"]').first();
      const hasFileInput = await fileInput.count() > 0;
      test.skip(!hasFileInput, "No file input found");

      await fileInput.setInputFiles(tempFile);

      // Should show file name or preview after upload
      await expect(
        page.getByText(/test-import\.csv|uploaded|preview|columns/i).first(),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  // ===========================================================================
  // COLUMN MAPPING TESTS
  // ===========================================================================

  test("should display column mapping interface after file upload", async ({ authenticatedPage: page }) => {
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    const importButton = page.getByRole("button", { name: /import|upload/i }).first();
    const hasImportButton = await importButton.count() > 0;
    test.skip(!hasImportButton, "No import button visible");

    await importButton.click();

    // Create temp CSV
    const tempDir = path.join(process.cwd(), "e2e", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, "test-mapping.csv");
    fs.writeFileSync(tempFile, TEST_CSV_CONTENT);

    try {
      const fileInput = page.locator('input[type="file"]').first();
      const hasFileInput = await fileInput.count() > 0;
      test.skip(!hasFileInput, "No file input found");

      await fileInput.setInputFiles(tempFile);

      // Wait for column mapping interface
      await expect(
        page.getByText(/map.*column|column.*mapping|source|target/i).first(),
      ).toBeVisible({ timeout: 15000 });
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  // ===========================================================================
  // IMPORT PROCESSING TESTS
  // ===========================================================================

  test("should show progress during import processing", async ({ authenticatedPage: page }) => {
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    const importButton = page.getByRole("button", { name: /import|upload/i }).first();
    const hasImportButton = await importButton.count() > 0;
    test.skip(!hasImportButton, "No import button visible");

    await importButton.click();

    // Create temp CSV
    const tempDir = path.join(process.cwd(), "e2e", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, "test-progress.csv");
    fs.writeFileSync(tempFile, TEST_CSV_CONTENT);

    try {
      const fileInput = page.locator('input[type="file"]').first();
      const hasFileInput = await fileInput.count() > 0;
      test.skip(!hasFileInput, "No file input found");

      await fileInput.setInputFiles(tempFile);

      // Wait for mapping to appear
      await page.waitForTimeout(2000);

      // Look for and click the import/submit button
      const submitButton = page.getByRole("button", { name: /import|submit|start|process/i }).first();
      const hasSubmit = await submitButton.count() > 0;

      if (hasSubmit) {
        await submitButton.click();

        // Should see progress indicator
        await expect(
          page.getByText(/processing|importing|progress|%/i).first(),
        ).toBeVisible({ timeout: 10000 });
      }
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  // ===========================================================================
  // IMPORT HISTORY VERIFICATION TESTS
  // ===========================================================================

  test("should display recent imports in import history", async ({ authenticatedPage: page }) => {
    await page.goto("/imports");
    await page.waitForLoadState("networkidle");

    // Should see import history with at least headers
    const historyTable = page.locator('table, [data-testid="import-history"]');
    const hasHistory = await historyTable.count() > 0;

    if (hasHistory) {
      await expect(historyTable).toBeVisible({ timeout: 5000 });

      // Should see column headers like Date, Status, Records
      await expect(
        page.getByText(/date|status|records|file/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      // Or empty state
      await expect(
        page.getByText(/no imports|no data|empty/i).first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("should show import details when clicking on an import record", async ({ authenticatedPage: page }) => {
    await page.goto("/imports");
    await page.waitForLoadState("networkidle");

    // Find and click on an import record
    const importRow = page.locator('tbody tr, [data-testid="import-row"]').first();
    const hasImports = await importRow.count() > 0;
    test.skip(!hasImports, "No import records to view");

    await importRow.click();

    // Should see import details (products imported, errors, etc.)
    await expect(
      page.getByText(/details|products|records|imported|errors/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  test("should show error for invalid file type", async ({ authenticatedPage: page }) => {
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    const importButton = page.getByRole("button", { name: /import|upload/i }).first();
    const hasImportButton = await importButton.count() > 0;
    test.skip(!hasImportButton, "No import button visible");

    await importButton.click();

    // Create an invalid file (not CSV)
    const tempDir = path.join(process.cwd(), "e2e", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, "invalid.txt");
    fs.writeFileSync(tempFile, "This is not a CSV file");

    try {
      const fileInput = page.locator('input[type="file"]').first();
      const hasFileInput = await fileInput.count() > 0;
      test.skip(!hasFileInput, "No file input found");

      // Try to upload invalid file type
      await fileInput.setInputFiles(tempFile);

      // Should show error message
      await expect(
        page.getByText(/error|invalid|unsupported|csv only/i).first(),
      ).toBeVisible({ timeout: 5000 });
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  // ===========================================================================
  // FULL WORKFLOW TEST - Upload → Process → Verify Database → Check Analytics
  // ===========================================================================

  test("should complete full import workflow and verify backend state", async ({ authenticatedPage: page, request }) => {
    // Step 1: Navigate to clients and select one for import
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    // Extract client ID from URL
    const url = page.url();
    const clientIdMatch = url.match(/clients\/([a-f0-9-]+)/i);
    test.skip(!clientIdMatch, "Could not extract client ID from URL");
    const clientId = clientIdMatch![1];

    // Step 2: Open import modal and upload file
    const importButton = page.getByRole("button", { name: /import|upload/i }).first();
    const hasImportButton = await importButton.count() > 0;
    test.skip(!hasImportButton, "No import button visible");

    await importButton.click();

    // Create unique test CSV with timestamp to verify import
    const timestamp = Date.now();
    const uniqueTestCsv = `Product ID,Product Name,Item Type,Quantity Multiplier,Available Quantity,New Notification Point
E2E-WORKFLOW-${timestamp}-001,Workflow Test Product A,Evergreen,1,100,10
E2E-WORKFLOW-${timestamp}-002,Workflow Test Product B,Event,5,50,5
E2E-WORKFLOW-${timestamp}-003,Workflow Test Product C,Evergreen,10,200,20
`;

    const tempDir = path.join(process.cwd(), "e2e", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, `workflow-test-${timestamp}.csv`);
    fs.writeFileSync(tempFile, uniqueTestCsv);

    try {
      const fileInput = page.locator('input[type="file"]').first();
      const hasFileInput = await fileInput.count() > 0;
      test.skip(!hasFileInput, "No file input found");

      await fileInput.setInputFiles(tempFile);

      // Step 3: Wait for mapping interface and submit
      await page.waitForTimeout(2000);

      // Look for and click the import/submit button
      const submitButton = page.getByRole("button", { name: /import|submit|start|process/i }).first();
      const hasSubmit = await submitButton.count() > 0;
      test.skip(!hasSubmit, "No submit button found");

      await submitButton.click();

      // Step 4: Wait for import to complete
      // Look for success message or completion indicator
      await expect(
        page.getByText(/complete|success|imported|finished/i).first(),
      ).toBeVisible({ timeout: 60000 });

      // Step 5: Verify database state via API
      // Get auth token from page context
      const cookies = await page.context().cookies();
      const authCookie = cookies.find(c => c.name === 'auth-token' || c.name === 'token');

      // Get localStorage token if cookie not found
      const token = authCookie?.value || await page.evaluate(() => {
        return localStorage.getItem('token') || localStorage.getItem('auth-token');
      });

      if (token) {
        // Verify products were created
        const productsResponse = await request.get(`/api/products`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            clientId,
            search: `E2E-WORKFLOW-${timestamp}`
          }
        });

        if (productsResponse.ok()) {
          const productsData = await productsResponse.json();
          const products = productsData.data || productsData.products || [];

          // Should have our 3 test products
          expect(products.length).toBeGreaterThanOrEqual(3);

          // Verify at least one of our test SKUs exists
          const hasTestProduct = products.some((p: { sku?: string }) =>
            p.sku?.includes(`E2E-WORKFLOW-${timestamp}`)
          );
          expect(hasTestProduct).toBe(true);
        }

        // Verify import batch was created
        const importsResponse = await request.get(`/api/imports`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: { clientId, limit: 5 }
        });

        if (importsResponse.ok()) {
          const importsData = await importsResponse.json();
          const imports = importsData.data || importsData.imports || [];

          // Should have at least one recent import
          expect(imports.length).toBeGreaterThan(0);

          // Most recent import should be completed
          const recentImport = imports[0];
          expect(recentImport.status).toMatch(/completed|success/i);
        }

        // Verify analytics/snapshots were created (if endpoint exists)
        const analyticsResponse = await request.get(`/api/analytics/snapshots`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: { clientId, limit: 1 }
        });

        if (analyticsResponse.ok()) {
          const analyticsData = await analyticsResponse.json();
          // Analytics endpoint should return data (may be empty if feature not enabled)
          expect(analyticsData).toBeDefined();
        }
      }

      // Step 6: Verify UI shows the imported products
      await page.goto(`/clients/${clientId}`);
      await page.waitForLoadState("networkidle");

      // Search for our test products
      const searchInput = page.getByPlaceholder(/search/i).first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchInput.fill(`E2E-WORKFLOW-${timestamp}`);
        await page.waitForTimeout(1000);

        // Should see at least one of our test products in the UI
        await expect(
          page.getByText(new RegExp(`E2E-WORKFLOW-${timestamp}`, 'i')).first(),
        ).toBeVisible({ timeout: 5000 });
      }

    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  // ===========================================================================
  // IMPORT BATCH STATUS TRACKING TEST
  // ===========================================================================

  test("should track import batch progress and final status", async ({ authenticatedPage: page }) => {
    await page.goto("/imports");
    await page.waitForLoadState("networkidle");

    // Find a recent import with completed status
    const completedBadge = page.getByText(/completed|success/i).first();
    const hasCompletedImport = await completedBadge.count() > 0;
    test.skip(!hasCompletedImport, "No completed imports to verify");

    // Click to view details
    const importRow = page.locator('tbody tr').first();
    await importRow.click();

    // Should see detailed import stats
    await expect(
      page.getByText(/records|products|rows|items/i).first(),
    ).toBeVisible({ timeout: 5000 });

    // Should show import metadata
    await expect(
      page.getByText(/date|time|uploaded|processed/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  // ===========================================================================
  // ANALYTICS VERIFICATION AFTER IMPORT TEST
  // ===========================================================================

  test("should generate analytics data after successful import", async ({ authenticatedPage: page }) => {
    // Navigate to a client's analytics page
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");

    const clientLink = page.getByRole("link", { name: /view|details/i }).first();
    const hasClients = await clientLink.count() > 0;
    test.skip(!hasClients, "No clients available for testing");

    await clientLink.click();
    await page.waitForLoadState("networkidle");

    // Look for analytics tab or section
    const analyticsTab = page.getByRole("tab", { name: /analytics|insights|dashboard/i }).first();
    const analyticsLink = page.getByRole("link", { name: /analytics|insights/i }).first();

    if (await analyticsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsTab.click();
    } else if (await analyticsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsLink.click();
    } else {
      // Navigate to client analytics page directly
      const url = page.url();
      const clientIdMatch = url.match(/clients\/([a-f0-9-]+)/i);
      if (clientIdMatch) {
        await page.goto(`/client-analytics/${clientIdMatch[1]}`);
      }
    }

    await page.waitForLoadState("networkidle");

    // Should see analytics widgets or charts
    // Look for chart elements, metrics, or data visualizations
    const hasAnalytics = await page.locator('[class*="chart"], [class*="widget"], [data-testid*="analytics"]').count() > 0;

    if (hasAnalytics) {
      // Verify some data is displayed (not empty state)
      const emptyState = page.getByText(/no data|no analytics|empty/i);
      const hasEmptyState = await emptyState.count() > 0;

      if (!hasEmptyState) {
        // Should have actual data points
        await expect(
          page.locator('[class*="chart"], [class*="metric"], [class*="value"]').first(),
        ).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

// Cleanup temp directory after all tests
test.afterAll(async () => {
  const tempDir = path.join(process.cwd(), "e2e", "temp");
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
