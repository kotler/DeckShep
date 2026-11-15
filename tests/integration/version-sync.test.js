const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve('.');
const files = [
  'package.json',
  'com.kotl3r.deckshep.sdPlugin/package.json',
  'package-lock.json',
  'com.kotl3r.deckshep.sdPlugin/package-lock.json',
  'com.kotl3r.deckshep.sdPlugin/manifest.json',
];
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-version-'));
  for (const name of [...files, '.prettierrc.json']) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.copyFileSync(path.join(root, name), path.join(directory, name));
  }
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function version(directory, ...args) {
  return spawnSync(
    process.execPath,
    [path.join(root, 'scripts/version.mjs'), ...args],
    { cwd: directory, encoding: 'utf8' },
  );
}
test('syncing an unchanged version preserves every formatted file byte for byte', (t) => {
  const directory = fixture(t);
  const before = files.map((name) =>
    fs.readFileSync(path.join(directory, name)),
  );
  assert.equal(version(directory).status, 0);
  for (const [i, name] of files.entries())
    assert.deepEqual(
      fs.readFileSync(path.join(directory, name)),
      before[i],
      name,
    );
});
test('a version bump keeps identities and formatting stable and invalid input writes nothing', async (t) => {
  const directory = fixture(t);
  const original = JSON.parse(fs.readFileSync(path.join(directory, files[4])));
  assert.equal(version(directory, '9.8.7').status, 0);
  assert.equal(version(directory, '--check').status, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, files[4])));
  assert.equal(manifest.Version, '9.8.7.0');
  assert.deepEqual({ ...manifest, Version: original.Version }, original);
  const { formatJson } = await import('../../scripts/json-format.mjs');
  for (const name of files) {
    const text = fs.readFileSync(path.join(directory, name), 'utf8');
    assert.equal(
      text,
      await formatJson(JSON.parse(text), path.join(directory, name)),
    );
  }
  const before = files.map((name) =>
    fs.readFileSync(path.join(directory, name)),
  );
  assert.notEqual(version(directory, '9.8.7-beta.1').status, 0);
  for (const [i, name] of files.entries())
    assert.deepEqual(fs.readFileSync(path.join(directory, name)), before[i]);
});
