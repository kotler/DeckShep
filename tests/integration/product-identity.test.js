const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const expected = {
  rex: [
    '9B48E1EC-B8FD-5A1A-AE1B-9C87F57F3F3F',
    '285BDB27-37E3-5BAA-907E-7258EF20FE77',
    'c74c571c-67a2-59ae-a0cb-d3425b4ec652',
  ],
  herdr: [
    'AB25F8CF-5D02-51A5-8904-F666E35A500A',
    'A48A51FD-49CC-5DB3-96B0-39FD61DC6F1B',
    'b3474c7f-5db1-54b5-ac71-ca1aca05a173',
  ],
  'herdr-app': [
    '7297382B-CCCB-5C50-92B2-67B250A22A6B',
    'F504DF11-D009-53EF-A108-44FDC8AD4C07',
    '3fc5816b-6486-5387-bf92-bafca0840e67',
  ],
};
test('DeckShep source folder, manifest, workspace and package audit share the new identity', async () => {
  const folder = 'com.kotl3r.deckshep.sdPlugin';
  const manifest = JSON.parse(
    fs.readFileSync(path.join(folder, 'manifest.json')),
  );
  const root = JSON.parse(fs.readFileSync('package.json'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json'));
  assert.equal(manifest.UUID, 'com.kotl3r.deckshep');
  assert.equal(manifest.Actions[0].UUID, 'com.kotl3r.deckshep.key');
  assert(root.workspaces.includes(folder));
  assert(lock.packages[folder]);
  assert(!lock.packages['com.local.rexagents.sdPlugin']);
  assert(!fs.existsSync('com.local.rexagents.sdPlugin'));
  const audit = await import('../../scripts/audit.mjs');
  assert.equal(audit.PLUGIN, folder);
  assert.equal(audit.INSTALLER, 'com.kotl3r.deckshep.streamDeckPlugin');
});
test('DeckShep profiles and pages have deterministic fresh UUIDs and every key uses the new plugin/action', async (t) => {
  const { PROFILE_IDS, PAGE_IDS, profile, deviceTemplate, actionId } =
    await import('../../scripts/profiles.mjs');
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'deckshep-identity-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const ids = [];
  for (const [backend, [profileId, pageId, firstKey]] of Object.entries(
    expected,
  )) {
    assert.equal(PROFILE_IDS[backend], profileId);
    assert.equal(PAGE_IDS[backend], pageId);
    assert.equal(actionId(0, backend), firstKey);
    const dir = profile(directory, deviceTemplate, backend, '1.4.0.0');
    const page = JSON.parse(
      fs.readFileSync(path.join(dir, 'Profiles', pageId, 'manifest.json')),
    );
    for (const action of Object.values(page.Controllers[0].Actions)) {
      assert.equal(action.Plugin.UUID, 'com.kotl3r.deckshep');
      assert.equal(action.UUID, 'com.kotl3r.deckshep.key');
      assert.equal(action.Settings.profileScope, backend);
      ids.push(action.ActionID);
    }
  }
  assert.equal(new Set(ids).size, 45);
});
test('new Claude setup refuses old preview hooks until their exact original registration is removed', () => {
  const { plan } = require('../../src/agents/claude/configure');
  const { legacyInstall } = require('../helpers/claude-legacy');
  const oldOptions = {
    dir: '/fixture/com.local.rexagents.sdPlugin',
    node: '/fixture/node',
  };
  const options = {
    ...oldOptions,
    dir: '/fixture/com.kotl3r.deckshep.sdPlugin',
  };
  const original = {
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'unrelated-hook' }] }],
    },
    statusLine: { type: 'command', command: 'original-status' },
  };
  const legacy = legacyInstall(original, null, oldOptions);
  const before = JSON.stringify(legacy.settings);
  assert.throws(() => plan(legacy.settings, null, options), /previous plugin/);
  const statusOnly = { statusLine: legacy.settings.statusLine };
  assert.throws(() => plan(statusOnly, null, options), /previous plugin/);
  assert.equal(JSON.stringify(legacy.settings), before);
  const removed = plan(legacy.settings, legacy.registry, {
    ...oldOptions,
    remove: true,
  });
  assert.deepEqual(removed.settings, original);
  const next = plan(removed.settings, null, options);
  assert(
    next.registry.commands.hook.includes(
      '/com.kotl3r.deckshep.sdPlugin/claude-hook.js',
    ),
  );
  assert.deepEqual(next.settings.hooks.Stop[0], original.hooks.Stop[0]);
  assert.deepEqual(next.registry.originalStatusLine, original.statusLine);
});
