/**
 * @file playwright.config.js
 * @module PlaywrightConfig
 * @description Playwright E2E test configuration for Aetheris 4D.
 *              Targets Chromium only (Chrome 110+ per spec), uses the Vite dev server.
 * @author Aetheris 4D
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
