import { test, expect, type Page } from '../../tools/e2e';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function inspector(page: Page, replies = true) {
  const { bundle } = await import('../../scripts/bundle.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-inspector-'));
  fs.chmodSync(root, 0o700);
  try {
    await bundle(
      path.resolve('src/inspector/index.ts'),
      path.join(root, 'inspector.js'),
      { browser: true },
    );
    await bundle(
      path.resolve('src/app/preferences.ts'),
      path.join(root, 'preferences.js'),
      { browser: true, name: 'RexPreferences' },
    );
    const assets: Record<string, Buffer> = {
      '/inspector.html': fs.readFileSync(
        'com.kotl3r.deckshep.sdPlugin/inspector.html',
      ),
      '/inspector.js': fs.readFileSync(path.join(root, 'inspector.js')),
      '/preferences.js': fs.readFileSync(path.join(root, 'preferences.js')),
      '/sdpi-components.js': fs.readFileSync('vendor/sdpi/sdpi-components.js'),
    };
    await page.route('http://127.0.0.1:19190/**', async (route) => {
      const url = new URL(route.request().url());
      if (!assets[url.pathname]) return route.abort();
      await route.fulfill({
        body: assets[url.pathname],
        contentType: url.pathname.endsWith('.html')
          ? 'text/html'
          : 'text/javascript',
      });
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const frames: {
    event: string;
    context?: string;
    payload?: { kind?: string };
  }[] = [];
  await page.routeWebSocket('ws://localhost:19191', (socket) => {
    socket.onMessage((message) => {
      const frame = JSON.parse(String(message));
      frames.push(frame);
      if (!replies || frame.event !== 'sendToPlugin') return;
      const payload =
        frame.payload.kind === 'doctor'
          ? {
              kind: 'doctor',
              sessions: [],
              checks: [{ ok: false, reason: 'Fixture: no native connection' }],
            }
          : {
              kind: 'status',
              backend: 'herdr-app',
              profileScope: 'herdr-app',
              profileName: 'Herdr App',
              preferences: {
                prompts: { review: '', tests: '', continue: '' },
                herdrAppHome: '/fixture/app',
              },
              offline: false,
              agents: 2,
              setupBusy: false,
              message:
                frame.payload.kind === 'refresh' ? 'App status refreshed' : '',
            };
      socket.send(
        JSON.stringify({ event: 'sendToPropertyInspector', payload }),
      );
    });
  });
  await page.goto('http://127.0.0.1:19190/inspector.html');
  await page.evaluate(() =>
    (window as any).connectElgatoStreamDeckSocket(
      '19191',
      'fixture-registration',
      'registerPropertyInspector',
      JSON.stringify({
        application: { language: 'en', platform: 'mac', version: '6.8.0' },
        devices: [{ id: 'fixture-device', type: 0 }],
      }),
      JSON.stringify({
        action: 'com.kotl3r.deckshep.key',
        context: 'fixture-action',
        device: 'fixture-device',
        payload: { settings: { profileScope: 'herdr-app' } },
      }),
    ),
  );
  return frames;
}

test('real pinned inspector library connects and Refresh status sends an App read request with visible results', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) =>
    errors.push(error.name + ': ' + error.message),
  );
  const frames = await inspector(page);
  await expect(page.locator('#connection')).toHaveText(
    '2 pane(s) · App-reported status',
  );
  await page.locator('#refresh').click();
  await expect(page.locator('#message')).toHaveText('App status refreshed');
  await expect(page.locator('#checklist')).toContainText(
    'Fixture: no native connection',
  );
  expect(
    frames.some(
      (frame) =>
        frame.payload?.kind === 'refresh' &&
        frame.context === 'fixture-registration',
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('Refresh status reports a missing plugin reply instead of silently doing nothing', async ({
  page,
}) => {
  await inspector(page, false);
  await page.locator('#refresh').click();
  await expect(page.locator('#message')).toHaveText('Refreshing status…');
  await expect(page.locator('#message')).toContainText('No plugin response', {
    timeout: 6000,
  });
});
