import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4173', headless: true, screenshot: 'only-on-failure' },
  webServer: process.env.TEST_BASE_URL ? undefined : { command: 'npm run dev -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
});
