import { defineConfig, devices } from '@playwright/test';

// Environment variables to pass to webServer processes
const serverEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://inventory_test:test123@localhost:5432/inventory_test',
  JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-long-for-e2e',
  REDIS_URL: process.env.REDIS_URL || '',
  NODE_ENV: process.env.NODE_ENV || 'test',
  PORT: '3001',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 6,
  // Global timeout for the entire test run (10 minutes in CI)
  globalTimeout: process.env.CI ? 600000 : undefined,
  // Timeout for each test (60 seconds)
  timeout: 60000,
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
      stdout: 'ignore',
      stderr: 'pipe',
      env: serverEnv,
    },
    {
      command: 'npm run preview:web',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60000, // 1 minute to start
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run preview:portal',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
