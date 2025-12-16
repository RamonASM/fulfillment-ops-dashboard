import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 6,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:80',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Playwright automatically starts these servers before tests and stops them after
  webServer: [
    {
      command: 'npm run start:api',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000, // 2 minutes to start
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run preview:web',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60000, // 1 minute to start
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run preview:portal',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
