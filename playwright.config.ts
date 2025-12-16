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
    baseURL: 'http://localhost:80',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Add more browsers as needed
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* webServer: [
    {
      command: 'npm run start:api',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      cwd: '.',
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
      },
    },
    {
      command: 'npm run preview:web',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      cwd: '.',
    },
  ], */
});
