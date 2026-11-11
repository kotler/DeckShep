const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { spawnSync } = require('node:child_process');
test(
  'built standalone Claude entry paths survive a real-file 1.3.4 recovery upgrade and remove only owned integration commands',
  { timeout: 30000 },
  async (t) => {
    const { bundle } = await import('../../scripts/bundle.mjs'),
      { installLocal } = await import('../../scripts/install.mjs'),
      { profile, deviceTemplate, PAGE_IDS } =
        await import('../../scripts/profiles.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-built-upgrade-')),
      home = path.join(root, 'home'),
      name = 'com.kotl3r.deckshep.sdPlugin',
      source = path.join(root, 'dist', name),
      base = path.join(
        home,
        'Library/Application Support/com.elgato.StreamDeck',
      ),
      dest = path.join(base, 'Plugins', name);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(source, 'bin'), { recursive: true });
    for (const file of ['manifest.json', 'config.json'])
      fs.copyFileSync(
        path.join('com.kotl3r.deckshep.sdPlugin', file),
        path.join(source, file),
      );
    fs.writeFileSync(
      path.join(source, 'bin/plugin.js'),
      '// host entry covered by fake-host test',
    );
    fs.writeFileSync(path.join(source, 'bin/visible-pane'), 'fixture helper');
    fs.writeFileSync(path.join(source, 'bin/herdr-app-peer'), 'fixture helper');
    fs.writeFileSync(
      path.join(source, 'bin/codex-hook-process'),
      'fixture helper',
    );
    await bundle(
      path.resolve('src/plugin/configure-entry.ts'),
      path.join(source, 'configure-claude.js'),
    );
    await bundle(
      path.resolve('src/plugin/hook-entry.ts'),
      path.join(source, 'claude-hook.js'),
    );
    await bundle(
      path.resolve('src/plugin/codex-hook-entry.ts'),
      path.join(source, 'codex-hook.js'),
    );
    await bundle(
      path.resolve('src/plugin/configure-codex-entry.ts'),
      path.join(source, 'configure-codex.js'),
    );
    fs.cpSync(source, dest, { recursive: true });
    const profiles = path.join(base, 'ProfilesV3'),
      rex = profile(
        profiles,
        { ...deviceTemplate, UUID: 'fixture-device' },
        'rex',
        '1.3.4.0',
      ),
      page = path.join(rex, 'Profiles', PAGE_IDS.rex, 'manifest.json');
    fs.writeFileSync(page, '{"customized":"existing keys"}');
    const settings = path.join(home, '.claude/settings.json');
    fs.mkdirSync(path.dirname(settings), { mode: 0o700 });
    fs.writeFileSync(
      settings,
      '{"permissions":{"allow":["Read"]},"hooks":{"Stop":[{"hooks":[{"type":"command","command":"unrelated"}]}]}}',
      { mode: 0o600 },
    );
    const run = (args) => {
      const result = spawnSync(
        process.execPath,
        [
          path.join(dest, 'configure-claude.js'),
          '--settings',
          settings,
          ...args,
        ],
        { cwd: dest, env: { ...process.env, HOME: home }, encoding: 'utf8' },
      );
      assert.equal(result.status, 0, result.stderr);
    };
    run(['--apply']);
    const before = fs.readFileSync(settings),
      record = fs.readFileSync(path.join(dest, 'state/claude-setup.json'));
    installLocal({ root, home, processStatus: 1 });
    assert.deepEqual(fs.readFileSync(settings), before);
    assert.deepEqual(
      fs.readFileSync(path.join(dest, 'state/claude-setup.json')),
      record,
    );
    assert.equal(
      fs.readFileSync(page, 'utf8'),
      '{"customized":"existing keys"}',
    );
    const registry = JSON.parse(record);
    assert(registry.commands.hook.includes(path.join(dest, 'claude-hook.js')));
    assert(fs.existsSync(path.join(dest, 'claude-hook.js')));
    run(['--remove', '--apply']);
    const after = JSON.parse(fs.readFileSync(settings));
    assert.deepEqual(after.permissions, { allow: ['Read'] });
    assert.equal(after.hooks.Stop[0].hooks[0].command, 'unrelated');
    // The new Codex helpers are standalone too. Setup/removal touch only this
    // temporary HOME and preserve the user's status-line configuration.
    const codexHome = path.join(home, '.codex');
    fs.mkdirSync(codexHome, { mode: 0o700 });
    const codexConfig = path.join(codexHome, 'config.toml');
    fs.writeFileSync(codexConfig, '[tui]\nstatus_line = ["model-name"]\n');
    const originalConfig = fs.readFileSync(codexConfig);
    const runCodex = (flags) => {
      const result = spawnSync(
        process.execPath,
        [path.join(dest, 'configure-codex.js'), ...flags],
        {
          cwd: dest,
          env: { ...process.env, HOME: home, CODEX_HOME: codexHome },
          encoding: 'utf8',
        },
      );
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    assert.match(runCodex([]), /applyRequired/);
    assert(!fs.existsSync(path.join(codexHome, 'hooks.json')));
    assert.match(runCodex(['--apply']), /Review and trust/);
    const codexSaved = JSON.parse(
      fs.readFileSync(path.join(dest, 'state/codex-setup.json')),
    );
    assert(codexSaved.command.includes(path.join(dest, 'codex-hook.js')));
    fs.writeFileSync(
      path.join(dest, 'state/codex-setup.json'),
      JSON.stringify({ ...codexSaved, active: false }),
      { mode: 0o600 },
    );
    const hookRun = spawnSync(
      process.execPath,
      [path.join(dest, 'codex-hook.js')],
      {
        cwd: dest,
        env: { ...process.env, HOME: home, CODEX_HOME: codexHome },
        input: '{}',
        encoding: 'utf8',
      },
    );
    assert.equal(hookRun.status, 0);
    assert.equal(
      hookRun.stdout + hookRun.stderr,
      '',
      'revoked hook performs no process reads and fails silently',
    );
    assert.match(runCodex(['--remove', '--apply']), /removed/);
    assert.deepEqual(fs.readFileSync(codexConfig), originalConfig);
  },
);
