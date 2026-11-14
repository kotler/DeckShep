import { defineConfig } from '../../../tools/e2e';
export default defineConfig({
  testDir: '.',
  testMatch: 'navigation.spec.js',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: 'list',
  use: { browserName: 'chromium', headless: true },
});
