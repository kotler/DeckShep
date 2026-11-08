const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function svg(host, index) {
  const image = host.frames
    .filter((f) => f.event === 'setImage' && f.context === 'key-' + index)
    .at(-1)?.payload.image;
  return image ? Buffer.from(image.split(',')[1], 'base64').toString() : '';
}
async function fixture(t) {
  const { prepareVirtualHost } = await import('../../e2e/virtual-host/host.ts');
  const host = await prepareVirtualHost({
    fixture: 'tests/e2e/virtual-host/scenario-dependencies.ts',
  });
  t.after(() => host.stop());
  await host.start();
  await host.until(() => host.frames.some((f) => f.event === 'registerPlugin'));
  for (let i = 0; i < 15; i++) host.send('willAppear', i);
  await host.settled();
  return host;
}
test(
  'scenario bundle switches every named fixture through refresh without native input',
  { timeout: 30000 },
  async (t) => {
    const host = await fixture(t);
    const { scenarioNames } =
      await import('../../e2e/virtual-host/scenarios.ts');
    for (const name of scenarioNames) {
      await host.command('scenario', name);
      const status = (await host.settled()).payload;
      assert.equal(status.offline, name === 'offline', name);
      assert.equal(
        status.agents,
        name === 'offline' || name === 'herdr-app-panes'
          ? 0
          : name === 'overflow-banks'
            ? 7
            : 2,
        name,
      );
      if (name === 'herdr-app-panes') {
        // App panes are a separate model, never synthetic Rex agents/PIDs.
        assert.equal(status.metadata, 0);
        assert.equal(status.selected, null);
      }
      assert.equal(
        new Set(
          host.frames
            .filter((f) => f.event === 'setImage')
            .map((f) => f.context),
        ).size,
        15,
      );
    }
    assert.deepEqual(
      host.input.filter((m) => m.kind === 'fixtureInput'),
      [],
    );
    assert.equal(host.errors, '');
    const directory = host.directory;
    await host.stop();
    assert(
      !fs.existsSync(directory),
      'owned temporary HOME and plugin are removed',
    );
    assert.equal(
      host.child.exitCode !== null || host.child.signalCode !== null,
      true,
    );
  },
);
test(
  'manual time arms context controls and expires notices; trace is guarded and deterministic',
  { timeout: 30000 },
  async (t) => {
    const host = await fixture(t);
    await host.command('scenario', 'working-rex');
    host.send('keyDown', 0);
    await host.settled();
    assert.deepEqual(
      host.input.filter((m) => m.kind === 'fixtureInput').map((m) => m.args),
      [['focus', '--session', 'fixture', 'a']],
    );
    assert(svg(host, 14).includes('Interrupt'));
    host.send('keyDown', 14);
    await host.settled();
    assert.equal(
      host.input.filter((m) => m.kind === 'fixtureInput').length,
      1,
      'arming refuses',
    );
    assert(
      host.frames.some(
        (f) => f.event === 'showAlert' && f.context === 'key-14',
      ),
    );
    assert.equal((await host.command('advance', 350)).clock, 10350);
    host.send('keyDown', 14);
    await host.settled();
    const warning = svg(host, 14);
    assert(warning.includes('Enable visible-'));
    assert.equal(
      host.input.filter((m) => m.kind === 'fixtureInput').length,
      1,
      'fresh consent stays off',
    );
    await host.command('advance', 9999);
    await host.settled();
    assert.equal(svg(host, 14), warning);
    await host.command('advance', 1);
    await host.settled();
    assert.notEqual(
      svg(host, 14),
      warning,
      'notice expires only through manual time',
    );
    host.send('sendToPlugin', 0, {
      kind: 'preferences',
      preferences: { allowClipboardFocus: true },
    });
    await host.settled();
    host.send('keyDown', 14);
    host.send('keyUp', 14);
    await host.settled();
    assert.deepEqual(
      host.input.filter((m) => m.kind === 'fixtureInput').map((m) => m.args),
      [
        ['focus', '--session', 'fixture', 'a'],
        ['send-key', '-s', 'fixture', '-b', 'a', 'escape'],
      ],
    );
    const before = svg(host, 0);
    await host.command('advance', 5000);
    await host.settled();
    assert.equal(svg(host, 0), before, 'working animation stays off');
    await assert.rejects(() => host.command('advance', -1), /refused/);
    assert.equal((await host.command('barrier')).clock, 25350);
  },
);
test(
  'production bundle and package audits reject virtual fixtures and development artifacts',
  { timeout: 30000 },
  async (t) => {
    const { prepareVirtualHost } =
      await import('../../e2e/virtual-host/host.ts');
    const { bundle } = await import('../../../scripts/bundle.mjs');
    const { auditArchive, assertProductionBundle } =
      await import('../../../scripts/audit.mjs');
    const { zip } = await import('../../../scripts/archive.mjs');
    const { scenarioNames } =
      await import('../../e2e/virtual-host/scenarios.ts');
    const host = await prepareVirtualHost();
    t.after(() => host.stop());
    const output = path.join(host.plugin, 'production.js');
    await bundle(path.resolve('src/plugin/entry.mts'), output);
    assertProductionBundle(fs.readFileSync(output));
    for (const marker of [
      'fixtureInput',
      'fixtureAck',
      'fixture-post-close-peer-lease',
      ...scenarioNames.filter(
        (name) => name.includes('-') && name !== 'herdr-tui',
      ),
    ]) {
      assert.throws(
        () => assertProductionBundle(Buffer.from(marker)),
        /fixture/i,
      );
      assert.throws(
        () => auditArchive(zip(new Map([['bin/plugin.js', marker]]))),
        /fixture/i,
      );
    }
    for (const name of [
      'tests/e2e/page.html',
      'ms-playwright/chromium',
      'playwright-report/index.html',
      'test-results/diff.png',
    ])
      assert.throws(
        () => auditArchive(zip(new Map([[name, 'fixture']]))),
        /development/i,
      );
  },
);
