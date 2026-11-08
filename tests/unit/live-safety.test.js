const { test } = require('node:test'),
  assert = require('node:assert/strict');
const {
  authorization,
  OwnedProcesses,
  settingsHashes,
} = require('../live/safety.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
test('live gates reject CI, missing current authorization and missing Rex opt-in', () => {
  assert(authorization('rex', {}));
  assert(authorization('rex', { ASW_LIVE: '1' }));
  const env = { ASW_LIVE: '1', ASW_LIVE_AUTHORIZATION: 'test-owned-only' };
  assert.equal(authorization('herdr-tui', env), null);
  assert(authorization('rex', env));
  assert(authorization('herdr-tui', { ...env, CI: '1' }));
  assert.equal(authorization('rex', { ...env, ASW_LIVE_REX: '1' }), null);
});
test('ownership refuses unrelated/replaced PIDs and cleanup targets only spawned processes', () => {
  let started = 'original',
    killed = 0;
  const child = {
    pid: 100,
    exitCode: null,
    kill() {
      killed++;
    },
  };
  const owned = new OwnedProcesses(
    (pid) => ({
      pid,
      ppid: pid === 101 ? 100 : 1,
      started: pid === 100 ? started : 'child',
    }),
    () => child,
  );
  owned.spawn('fixture', [], {});
  owned.assert(100);
  owned.assert(101);
  assert.throws(() => owned.assert(200), /not spawned/);
  started = 'replacement';
  assert.throws(() => owned.assert(100), /replaced/);
  assert.throws(() => owned.close());
  assert.equal(killed, 0);
  started = 'original';
  owned.close();
  assert.equal(killed, 1);
  child.exitCode = 0;
  owned.close();
  assert.equal(killed, 1);
});
test('settings hashes detect changed global files and refuse symbolic links', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-fingerprints-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const before = settingsHashes(home);
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude/settings.json'), '{}');
  assert.notDeepEqual(settingsHashes(home), before);
  fs.symlinkSync(
    path.join(home, '.claude/settings.json'),
    path.join(home, '.claude.json'),
  );
  assert.throws(() => settingsHashes(home));
});
