const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
test('native preset dialogs preserve baseline settings, verify fields and save only test-owned presets', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-native-setup-')); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['--require', require.resolve('tsx/cjs'), path.join(__dirname, '../fixtures/native-setup.cjs')], { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stdout + result.stderr);
});
