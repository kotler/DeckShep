const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
async function fixture(t) {
  const api = await import('../../scripts/migrate-upgrade.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-upgrade-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const base = path.join(
    home,
    'Library/Application Support/com.elgato.StreamDeck',
  );
  const installed = path.join(base, 'Plugins/com.local.rexagents.sdPlugin'),
    profiles = path.join(base, 'ProfilesV3');
  fs.mkdirSync(path.join(installed, 'state/claude'), { recursive: true });
  fs.mkdirSync(path.join(profiles, 'fixed-profile/Profiles/fixed-page'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(installed, 'manifest.json'),
    JSON.stringify({ UUID: 'com.local.rexagents', Version: '1.3.4.0' }),
  );
  fs.writeFileSync(
    path.join(installed, 'config.json'),
    JSON.stringify({
      allowClipboardFocus: true,
      prompts: { review: 'custom' },
      claude: { enabled: true },
    }),
  );
  fs.writeFileSync(
    path.join(installed, 'state/claude-setup.json'),
    '{"active":true,"commands":{"hook":"stable"}}\n',
  );
  fs.writeFileSync(
    path.join(installed, 'state/claude/123.json'),
    '{"private":"record"}\n',
  );
  const page = path.join(
    profiles,
    'fixed-profile/Profiles/fixed-page/manifest.json',
  );
  fs.writeFileSync(page, '{"customActionID":"keep exactly"}\n');
  const options = { home, processStatus: 1 };
  function upgrade() {
    fs.rmSync(installed, { recursive: true });
    fs.mkdirSync(path.join(installed, 'bin'), { recursive: true });
    fs.writeFileSync(
      path.join(installed, 'manifest.json'),
      '{"UUID":"com.local.rexagents","Version":"1.3.4.0"}',
    );
    fs.writeFileSync(
      path.join(installed, 'config.json'),
      JSON.stringify({
        allowClipboardFocus: false,
        bringToFront: false,
        prompts: { review: 'default', tests: 'default tests' },
        claude: { enabled: false, extra: false },
      }),
    );
    for (const name of [
      'bin/plugin.js',
      'claude-hook.js',
      'configure-claude.js',
    ])
      fs.writeFileSync(path.join(installed, name), 'new runtime');
    fs.writeFileSync(page, 'installer default');
  }
  return { ...api, options, installed, profiles, page, upgrade };
}
test('one-time native upgrade restores private config, setup records and exact profile bytes without replacing runtime', async (t) => {
  const f = await fixture(t),
    backup = f.backupUpgrade(f.options).backup;
  f.upgrade();
  assert.deepEqual(f.restoreUpgrade({ ...f.options, backup }), {
    preview: true,
    stateFiles: 2,
    profileFiles: 1,
  });
  assert(!fs.existsSync(path.join(f.installed, 'state')));
  const added = path.join(f.profiles, 'new-profile');
  fs.mkdirSync(added);
  fs.writeFileSync(path.join(added, 'manifest.json'), 'new native profile');
  const result = f.restoreUpgrade({ ...f.options, backup, apply: true });
  assert(result.restored);
  assert.equal(
    fs.readFileSync(path.join(f.profiles, 'new-profile/manifest.json'), 'utf8'),
    'new native profile',
  );
  assert(fs.existsSync(result.backup));
  const config = JSON.parse(
    fs.readFileSync(path.join(f.installed, 'config.json')),
  );
  assert.deepEqual(config.prompts, {
    review: 'custom',
    tests: 'default tests',
  });
  assert.equal(config.allowClipboardFocus, true);
  assert.equal(config.bringToFront, false);
  assert.deepEqual(config.claude, { enabled: true, extra: false });
  assert.equal(
    fs.readFileSync(f.page, 'utf8'),
    '{"customActionID":"keep exactly"}\n',
  );
  assert.equal(
    fs.readFileSync(path.join(f.installed, 'state/claude/123.json'), 'utf8'),
    '{"private":"record"}\n',
  );
  assert.equal(
    fs.readFileSync(path.join(f.installed, 'claude-hook.js'), 'utf8'),
    'new runtime',
  );
  assert.equal(fs.statSync(backup).mode & 0o777, 0o700);
  assert.equal(
    fs.statSync(path.join(f.installed, 'state/claude-setup.json')).mode & 0o777,
    0o600,
  );
});
test('migration rejects tampering, other installations, symlinks, changed integration state and running Stream Deck before writes', async (t) => {
  const f = await fixture(t),
    backup = f.backupUpgrade(f.options).backup;
  f.upgrade();
  for (const processStatus of [0, 2, null])
    assert.throws(() =>
      f.restoreUpgrade({ ...f.options, backup, processStatus, apply: true }),
    );
  const state = path.join(f.installed, 'state');
  fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, 'claude-setup.json'), 'changed');
  assert.throws(
    () => f.restoreUpgrade({ ...f.options, backup, apply: true }),
    /state changed/,
  );
  fs.rmSync(state, { recursive: true });
  fs.symlinkSync(f.profiles, state);
  assert.throws(
    () => f.restoreUpgrade({ ...f.options, backup, apply: true }),
    /Unsafe/,
  );
  fs.unlinkSync(state);
  fs.chmodSync(backup, 0o755);
  assert.throws(
    () => f.restoreUpgrade({ ...f.options, backup, apply: true }),
    /private backup/,
  );
  fs.chmodSync(backup, 0o700);
  const lock = path.join(path.dirname(backup), 'restore.lock');
  fs.writeFileSync(lock, 'owned');
  assert.throws(
    () => f.restoreUpgrade({ ...f.options, backup, apply: true }),
    /EEXIST/,
  );
  fs.unlinkSync(lock);
  const recordFile = path.join(backup, 'backup.json'),
    recordBytes = fs.readFileSync(recordFile);
  const record = JSON.parse(recordBytes);
  record.destination = 'other installation';
  fs.writeFileSync(recordFile, JSON.stringify(record));
  assert.throws(
    () => f.restoreUpgrade({ ...f.options, backup, apply: true }),
    /destination/,
  );
  fs.writeFileSync(recordFile, recordBytes);
  fs.writeFileSync(path.join(backup, 'plugin/config.json'), '{}');
  assert.throws(
    () => f.restoreUpgrade({ ...f.options, backup, apply: true }),
    /integrity/,
  );
  assert.equal(fs.readFileSync(f.page, 'utf8'), 'installer default');
  assert.throws(() =>
    f.restoreUpgrade({
      ...f.options,
      backup: path.dirname(backup),
      apply: true,
    }),
  );
});
