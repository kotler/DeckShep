const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { IntegrationSetup, diagnostics, herdrSessions } = require('../../src/app/setup');
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-setup-')); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const plugin = path.join(home, 'plugin.sdPlugin'), settings = path.join(home, '.claude/settings.json');
  fs.mkdirSync(plugin, { recursive: true }); fs.mkdirSync(path.dirname(settings), { mode: 0o700 }); fs.writeFileSync(path.join(plugin, 'claude-hook.js'), '// fixture');
  const original = JSON.stringify({ permissions: { allow: ['Read'] }, statusLine: { type: 'command', command: 'fixture-status' }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'unrelated' }] }] } });
  fs.writeFileSync(settings, original, { mode: 0o600 });
  return { home, plugin, settings, original };
}
test('guided Claude setup previews exact changes, requires preview, preserves customization, privately backs up and undoes across restart', t => {
  const paths = fixture(t), setup = new IntegrationSetup(paths);
  assert.throws(() => setup.apply(), /Preview/);
  const diff = setup.preview(false, true);
  assert.deepEqual(JSON.parse(diff.before), JSON.parse(paths.original)); assert.notEqual(diff.before, diff.after);
  assert.equal(fs.readFileSync(paths.settings, 'utf8'), paths.original);
  setup.apply();
  const after = JSON.parse(fs.readFileSync(paths.settings));
  assert.deepEqual(after.permissions, { allow: ['Read'] }); assert.equal(after.hooks.Stop[0].hooks[0].command, 'unrelated');
  assert.equal(fs.statSync(path.join(paths.plugin, 'state/claude-undo.json')).mode & 0o777, 0o600);
  new IntegrationSetup(paths).undo(); assert.equal(fs.readFileSync(paths.settings, 'utf8'), paths.original);
  assert.throws(() => new IntegrationSetup(paths).undo(), /No integration/);
});
test('preview/apply and undo refuse concurrent edits; removal restores owned status line only', t => {
  const paths = fixture(t), setup = new IntegrationSetup(paths);
  setup.preview(); fs.writeFileSync(paths.settings, paths.original + '\n'); assert.throws(() => setup.apply(), /changed/);
  setup.preview(false, true); setup.apply(); setup.preview(true); setup.apply();
  assert.deepEqual(JSON.parse(fs.readFileSync(paths.settings)), JSON.parse(paths.original));
  fs.writeFileSync(paths.settings, '{"unrelated":"new"}'); assert.throws(() => setup.undo(), /changed/);
  assert.equal(fs.readFileSync(paths.settings, 'utf8'), '{"unrelated":"new"}');
});
test('doctor reasons contain no home paths or settings; unsafe session directories are ignored', async t => {
  const paths = fixture(t);
  const checks = await diagnostics({ home: paths.home, model: 0, online: true, rex: async () => ({ binary: '/fixture', application: '/fixture' }), selected: { chatId: 'private-chat-id', app: 'codex' } });
  assert.equal(checks.find(c => c.id === 'device').ok, true); assert.equal(checks.find(c => c.id === 'codex').ok, true);
  assert(!JSON.stringify(checks).includes(paths.home)); assert(!JSON.stringify(checks).includes('private-chat-id'));
  assert.deepEqual(herdrSessions(paths.home), []);
  assert.equal((await diagnostics({ rex: async () => { throw Error('secret'); } })).find(c => c.id === 'rex').ok, false);
});
test('removal disables hooks before clearing private lifecycle records and never follows a replaced state directory', t => {
  const paths = fixture(t), setup = new IntegrationSetup(paths), directory = path.join(paths.plugin, 'state/claude');
  setup.preview(); setup.apply(); fs.mkdirSync(directory, { mode: 0o700 }); fs.writeFileSync(path.join(directory, '42.json'), '{}', { mode: 0o600 }); fs.writeFileSync(path.join(directory, '42.invalid'), 'fixture', { mode: 0o600 });
  setup.preview(true); setup.apply(); assert.deepEqual(fs.readdirSync(directory), []);
  setup.preview(); setup.apply(); fs.rmSync(directory, { recursive: true }); fs.symlinkSync(path.dirname(paths.settings), directory);
  setup.preview(true); assert.throws(() => setup.apply(), /Unsafe/); assert.deepEqual(JSON.parse(fs.readFileSync(paths.settings, 'utf8')), JSON.parse(paths.original));
});
