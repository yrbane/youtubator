import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5199',
  },
  webServer: {
    command: 'pnpm --filter @youtubator/web dev',
    port: 5199,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
