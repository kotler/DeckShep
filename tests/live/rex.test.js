const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { authorization, settingsHashes, OwnedProcesses } = require('./safety.cjs');
const reason = authorization('rex');
test('live Rex: explicit extra gate and test-owned process proof', { skip: reason || false, timeout: 30000 }, async t => {
  // A separate Rex GUI instance must be supplied; launching the ordinary app
  // could activate the user's existing process. No default launch is allowed.
  assert(process.env.ASW_REX_ISOLATED_LAUNCHER, 'Provide a launcher for a disposable Rex instance; existing instances are never adopted');
  const before = settingsHashes(os.homedir()), directory = fs.mkdtempSync(path.join('/tmp', 'asw-rex-live-')), owned = new OwnedProcesses();
  t.after(() => { try { owned.close(); } finally { assert.deepEqual(settingsHashes(os.homedir()), before); fs.rmSync(directory, { recursive: true, force: true }); } });
  const child = owned.spawn(process.env.ASW_REX_ISOLATED_LAUNCHER, ['--asw-owned-home', directory], { env: { ...process.env, HOME: directory, REX_SESSION: '', REX_BLOCK: '', REX_CLIENT: '' }, cwd: directory });
  owned.assert(child.pid);
  assert(!owned.owned.has(process.pid));
});
