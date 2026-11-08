const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test(
  'official SDK bundled plugin registers, renders all coordinates, routes settings, refuses stale presses and hides disappeared keys',
  { timeout: 30000 },
  async (t) => {
    const { bundle } = await import('../../../scripts/bundle.mjs');
    const { prepareVirtualHost } =
      await import('../../e2e/virtual-host/host.ts');
    const host = await prepareVirtualHost();
    t.after(() => host.stop());
    const { plugin, frames, input } = host;
    assert(
      fs
        .readFileSync(path.join(plugin, 'bin/plugin.js'), 'utf8')
        .includes('fixtureInput'),
      'fixture alias must resolve before launch',
    );
    await host.start();
    const child = host.child;
    const until = (predicate) => host.until(predicate);
    const send = (...args) => host.send(...args);
    await until(() => frames.some((frame) => frame.event === 'registerPlugin'));
    assert.deepEqual(
      frames.find((frame) => frame.event === 'registerPlugin'),
      { event: 'registerPlugin', uuid: 'com.kotl3r.deckshep' },
    );
    for (let i = 0; i < 15; i++) send('willAppear', i);
    await until(
      () =>
        new Set(
          frames.filter((f) => f.event === 'setImage').map((f) => f.context),
        ).size === 15,
    );
    assert.equal(
      new Set(
        frames.filter((f) => f.event === 'setTitle').map((f) => f.context),
      ).size,
      15,
    );
    send('propertyInspectorDidAppear', 0);
    send('sendToPlugin', 0, { kind: 'status' });
    await until(() =>
      frames.some((frame) => frame.event === 'sendToPropertyInspector'),
    );
    const status = frames.find(
      (frame) => frame.event === 'sendToPropertyInspector',
    ).payload;
    assert.equal(status.profileScope, 'rex');
    assert.equal(status.preferences.allowClipboardFocus, false);
    assert.equal(status.preferences.claudeEnabled, false);
    await new Promise((resolve) => setTimeout(resolve, 400));
    send('keyDown', 0);
    send('keyUp', 0);
    await until(() => input.some((frame) => frame.kind === 'fixtureInput'));
    assert.deepEqual(input[0].args, ['focus', '--session', 'fixture', 'a']);
    // Every coordinate gets a down/up via a per-key local inactive action. This
    // exercises host routing without granting any synthetic native input.
    for (let i = 0; i < 15; i++) {
      send('didReceiveSettings', i, {
        settings: { profileScope: 'rex', action: 'none' },
      });
      send('keyDown', i);
      send('keyUp', i);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    const before = input.length;
    for (let i = 0; i < 15; i++) send('willDisappear', i);
    send('keyDown', 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(input.length, before);
    assert.equal(host.errors, '');
    assert(
      !fs.existsSync(path.join(plugin, 'logs')),
      'Host settings never reach SDK log files',
    );
    host.closeSocket();
    await until(() => child.exitCode !== null);
    assert.equal(
      child.exitCode,
      0,
      'SDK disconnect must invalidate keys and exit like the baseline',
    );
    const production = path.join(plugin, 'bin/production.js');
    await bundle(path.resolve('src/plugin/entry.mts'), production);
    assert(
      !fs.readFileSync(production, 'utf8').includes('fixtureInput'),
      'production bundle has no fixture switch',
    );
  },
);
