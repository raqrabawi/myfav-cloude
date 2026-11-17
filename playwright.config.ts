import { defineConfig } from '@playwright/test';

/**
 * The SAME guest-mode E2E specs run against the original build and the V2
 * build. Passing on both projects demonstrates behavioural parity.
 *   ORIG_URL (default http://127.0.0.1:3101)  -> original MyFav-main `vite build` preview
 *   V2_URL   (default http://127.0.0.1:3102)  -> MyFav V2 `vite build` preview
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e/results.json' }]],
  use: {
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'off',
  },
  projects: [
    { name: 'original', use: { baseURL: process.env.ORIG_URL || 'http://127.0.0.1:3101' } },
    { name: 'v2', use: { baseURL: process.env.V2_URL || 'http://127.0.0.1:3102' } },
  ],
});
