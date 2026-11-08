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
test('private live environment drops routing and shared credentials; access-only auth cannot refresh the owner login', (t) => {
  const {
    isolatedEnvironment,
    accessOnly,
  } = require('../live/environment.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-env-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = isolatedEnvironment(dir, {
    PATH: '/test',
    CODEX_HOME: '/shared',
    HERDR_SESSION: 'existing',
    CODEX_THREAD_ID: 'existing',
    OPENAI_API_KEY: 'secret',
    NODE_OPTIONS: 'unsafe',
    CLAUDE_CODE_OAUTH_TOKEN: 'secret',
  });
  assert.equal(env.PATH, '/test');
  assert.equal(env.HERDR_SESSION, undefined);
  assert.equal(env.CODEX_THREAD_ID, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert(env.CODEX_HOME.startsWith(dir));
  const now = Date.now(),
    token =
      'header.' +
      Buffer.from(
        JSON.stringify({ exp: Math.floor(now / 1000) + 3600 }),
      ).toString('base64url') +
      '.signature';
  const original = {
    tokens: { access_token: token, refresh_token: 'owner-refresh' },
  };
  assert.equal(accessOnly(original, now).tokens.refresh_token, '');
  assert.equal(original.tokens.refresh_token, 'owner-refresh');
  assert.throws(() => accessOnly(original, now + 3600000), /expires/);
});
test('observed descendant cleanup rechecks start time and ancestry before signalling', () => {
  let started = 'same';
  const signals = [];
  const child = { pid: 100, exitCode: null, kill: () => {} };
  const owned = new OwnedProcesses(
    (pid) => ({
      pid,
      ppid: pid === 101 ? 100 : 1,
      started: pid === 101 ? started : 'root',
    }),
    () => child,
    (pid, signal) => signals.push([pid, signal]),
  );
  owned.spawn('fixture', [], {});
  owned.observe(101);
  owned.close();
  assert.deepEqual(signals, [[101, 'SIGTERM']]);
  started = 'replaced';
  owned.close();
  assert.equal(signals.length, 1);
  assert.throws(() => owned.observe(200));
});
test('bounded shutdown force-stops only proven descendants when graceful exit is ignored', async () => {
  const alive = new Set([100, 101, 200]),
    signals = [];
  const child = {
    pid: 100,
    exitCode: null,
    signalCode: null,
    kill: (signal) => {
      signals.push([100, signal]);
      if (signal === 'SIGKILL') {
        alive.delete(100);
        child.signalCode = signal;
      }
    },
  };
  const owned = new OwnedProcesses(
    (pid) => {
      if (!alive.has(pid)) throw Error('Exited');
      return { pid, ppid: pid === 101 ? 100 : 1, started: 'original-' + pid };
    },
    () => child,
    (pid, signal) => {
      signals.push([pid, signal]);
      if (signal === 'SIGKILL') alive.delete(pid);
    },
  );
  owned.spawn('fixture', [], {});
  await owned.shutdown({
    rows: [
      [100, 1],
      [101, 100],
      [200, 1],
    ],
    graceMs: 1,
  });
  assert.deepEqual(signals, [
    [101, 'SIGTERM'],
    [100, 'SIGTERM'],
    [101, 'SIGKILL'],
    [100, 'SIGKILL'],
  ]);
  assert(alive.has(200));
  assert(!alive.has(101));
  assert(!alive.has(100));
});
