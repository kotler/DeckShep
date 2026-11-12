'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const {
  CLAUDE_TESTED,
  claudeVersionStatus,
  claudeVersionNote,
} = require('../../src/agents/claude/tested-range');
const { diagnostics: checklist } = require('../../src/app/setup');

test('only calibrated Claude releases are reported as tested', () => {
  for (const version of CLAUDE_TESTED)
    assert.equal(claudeVersionStatus(version), 'tested');
  for (const version of ['2.1.318', '2.1.320', '2.1.323'])
    assert.equal(claudeVersionStatus(version), 'unverified');
  for (const value of [undefined, null, '', '2.1', 'latest', 2, '2.1.322-beta'])
    assert.equal(claudeVersionStatus(value), 'unknown');
});

test('the setup note names the release and fits the inspector limit', () => {
  for (const version of [
    '2.1.322',
    '2.1.999',
    '1.0.0',
    undefined,
    '99.99.99',
  ]) {
    const note = claudeVersionNote(version);
    assert(note.length <= 160, note);
    assert(!note.includes('undefined'));
  }
  assert.match(claudeVersionNote('2.1.322'), /has been tested/);
  assert.match(claudeVersionNote('2.1.999'), /has not been verified/);
  assert.match(claudeVersionNote('1.0.0'), /has not been verified/);
});

test('setup warns about an untested Claude release without blocking other rows', async (t) => {
  // A private home: the checklist must not read the real Claude settings.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-range-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const paths = {
    home,
    plugin: path.join(home, 'plugin.sdPlugin'),
    settings: path.join(home, '.claude/settings.json'),
  };
  const rex = async () => {
    throw Error('no Rex in this test');
  };
  const run = (selected) =>
    checklist({
      home,
      paths,
      selected,
      model: 0,
      online: true,
      rex,
    });
  const row = (checks) => checks.find((c) => c.id === 'claude-version');
  const base = { app: 'claude-code', nativeVerified: true };
  assert.equal(row(await run({ ...base, cliVersion: '2.1.322' })).ok, true);
  const newer = await run({ ...base, cliVersion: '2.1.400' });
  assert.equal(row(newer).ok, false);
  assert.match(row(newer).reason, /2\.1\.400 has not been verified/);
  // The identity row is independent of the version note.
  assert.equal(newer.find((c) => c.id === 'claude').ok, true);
  // No row without a Claude selection or without a readable release.
  assert.equal(row(await run(base)), undefined);
  assert.equal(row(await run({ app: 'codex', chatId: 'x' })), undefined);
  assert.equal(row(await run(null)), undefined);
  // A known blocker becomes one explained row; none is invented.
  const explain = async (blocker) =>
    (
      await checklist({ home, paths, selected: base, model: 0, blocker, rex })
    ).find((c) => c.id === 'controls');
  assert.deepEqual(await explain('custom-keys'), {
    id: 'controls',
    ok: false,
    reason:
      'Claude has a custom keybindings.json. Native controls work only with the default keybindings.',
  });
  assert.match((await explain('no-status')).reason, /^Rex has no status/);
  assert.equal(await explain(null), undefined);
});
