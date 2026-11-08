// Tools are deliberately nested by .npmrc, outside the shipped plugin.
import { defineConfig } from './tools/e2e';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{platform}{ext}',
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1100, height: 1000 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run deck:preview',
    wait: {
      stdout: /DeckShep virtual deck: (?<deck_url>http:\/\/127\.0\.0\.1:\d+)/,
    },
    timeout: 30000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
