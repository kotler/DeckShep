const { test } = require('node:test');
function execFileSync(file, args, options) {
  return require('node:child_process').execFileSync(
    file,
    ['--require', require.resolve('tsx/cjs'), ...args],
    options,
  );
}
test('claude setup', () => {
  'use strict';
  const assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os'),
    { execFileSync: nativeExecFileSync } = require('node:child_process');
  const {
    plan,
    commands,
    EVENTS,
  } = require('../../src/agents/claude/configure');
  const root = '/plugin with space',
    node = '/node with space',
    options = { dir: root, node, statusline: true };
  const original = {
      permissions: {
        defaultMode: 'default',
        allow: ['Read'],
        deny: ['Bash(rm:*)'],
      },
      env: { ANTHROPIC_API_KEY: 'PRIVATE' },
      statusLine: { type: 'command', command: 'printf existing', padding: 3 },
      hooks: {
        Stop: [
          { matcher: '', hooks: [{ type: 'command', command: 'other-hook' }] },
        ],
      },
    },
    before = JSON.stringify(original);
  let install = plan(original, null, options);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(install.settings.permissions, original.permissions);
  assert.deepEqual(install.settings.env, original.env);
  assert.equal(install.settings.hooks.Stop.length, 2);
  assert.equal(install.settings.statusLine.padding, 3);
  assert.equal(install.registry.originalStatusLine.command, 'printf existing');
  let again = plan(install.settings, install.registry, options);
  assert.deepEqual(again.settings, install.settings);
  let removed = plan(again.settings, again.registry, {
    ...options,
    remove: true,
  });
  assert.deepEqual(removed.settings, original);
  assert.equal(removed.registry.active, false);
  let edited = structuredClone(install.settings);
  edited.statusLine.command = 'user-replacement';
  removed = plan(edited, install.registry, { ...options, remove: true });
  assert.equal(removed.settings.statusLine.command, 'user-replacement');
  assert.throws(() => plan(edited, install.registry, options));
  let fresh = plan(removed.settings, removed.registry, options);
  assert.equal(fresh.registry.originalStatusLine.command, 'user-replacement');
  const extra = plan(
    { hooks: { Stop: [{ matcher: 'future', hooks: [] }] } },
    null,
    options,
  );
  assert.deepEqual(extra.settings.hooks.Stop[0], {
    matcher: 'future',
    hooks: [],
  });
  const empty = plan({}, null, options);
  assert.deepEqual(
    plan(empty.settings, empty.registry, { ...options, remove: true }).settings,
    {},
  );
  assert.throws(() => plan({ hooks: { Stop: [{}] } }, null, options));
  assert.throws(() =>
    plan(
      { statusLine: { type: 'prompt', prompt: 'never execute' } },
      null,
      options,
    ),
  );
  assert(!commands("/tmp/has'quote").hook.includes(" /tmp/has'quote"));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-claude-setup-'));
  try {
    fs.writeFileSync(path.join(d, 'claude-hook.js'), '');
    const file = path.join(d, 'settings.json');
    fs.writeFileSync(file, before, { mode: 0o600 });
    const script = path.join(__dirname, '../../src/agents/claude/configure.ts');
    const args = [
      script,
      '--plugin-dir',
      d,
      '--settings',
      file,
      '--statusline',
    ];
    let out = execFileSync(process.execPath, args, { encoding: 'utf8' });
    assert(out.includes('Preview only'));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert(!out.includes('PRIVATE'));
    assert.throws(() =>
      execFileSync(process.execPath, [script, '--settings'], {
        stdio: 'ignore',
      }),
    );
    fs.writeFileSync(file + '.switchboard-lock', '', { mode: 0o600 });
    assert.throws(() =>
      execFileSync(process.execPath, [...args, '--apply'], { stdio: 'ignore' }),
    );
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    fs.unlinkSync(file + '.switchboard-lock');
    execFileSync(process.execPath, [...args, '--apply']);
    assert.equal(
      fs.readdirSync(d).filter((x) => x.includes('deckshep-backup')).length,
      1,
    );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(file)).permissions,
      original.permissions,
    );
    execFileSync(process.execPath, [
      script,
      '--plugin-dir',
      d,
      '--settings',
      file,
      '--remove',
      '--apply',
    ]);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), original);
    for (const f of fs
      .readdirSync(d)
      .filter((x) => x.includes('deckshep-backup')))
      assert.equal(fs.statSync(path.join(d, f)).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
  console.log(
    'PASS explicit preview/apply/remove, idempotent hook merge, custom status-line chaining/restoration, concurrent customization preservation, private backups and unchanged permission/auth fields',
  );
});
