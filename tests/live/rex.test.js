const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const {
  authorization,
  settingsHashes,
  OwnedProcesses,
} = require('./safety.cjs');
const {
  isolatedEnvironment,
  signedInCredentials,
} = require('./environment.cjs');
const { spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { checkPicker } = require('./rex-picker.cjs');
const rex =
  '/Applications/Rex Beta.app/Contents/Helpers/Rex Server.rex/Contents/MacOS/rex';
const reason = authorization('rex');

function run(file, args, options) {
  const result = spawnSync(file, args, {
    ...options,
    encoding: 'utf8',
    timeout: 3000,
  });
  if (result.status !== 0)
    throw Error(
      'Disposable ' +
        path.basename(file) +
        ' command failed: ' +
        args.find((arg) =>
          ['new', 'ls', 'inspect', 'call', 'capture', 'send'].includes(arg),
        ),
    );
  return result.stdout;
}

function verifyListener(owned, pid, socket) {
  owned.assert(pid);
  const stat = fs.lstatSync(socket);
  assert(
    stat.isSocket() && stat.uid === process.getuid() && !(stat.mode & 0o077),
  );
  const files = run('/usr/sbin/lsof', ['-a', '-p', String(pid), '-U', '-Fn']);
  assert(
    files.split('\n').includes('n' + socket),
    'Owned Rex server must hold the private socket',
  );
}
test(
  'live Rex: owned foreground server creates and reads a disposable terminal',
  {
    skip: reason || false,
    timeout: process.env.ASW_LIVE_REX_STATES === '1' ? 600000 : 60000,
  },
  async (t) => {
    const before = settingsHashes(os.homedir()),
      directory = fs.realpathSync(
        fs.mkdtempSync(path.join('/tmp', 'asw-rex-live-')),
      ),
      owned = new OwnedProcesses();
    t.after(async () => {
      try {
        await owned.shutdown();
      } finally {
        try {
          assert.deepEqual(settingsHashes(os.homedir()), before);
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      }
    });
    const options = { env: isolatedEnvironment(directory), cwd: directory };
    const repo = path.join(directory, 'repo');
    fs.mkdirSync(repo, { mode: 0o700 });
    run('/usr/bin/git', ['init', '--quiet', repo], options);
    const providers = process.env.ASW_LIVE_REX_PROVIDERS === '1';
    let hookPlugin;
    const claudeHooks = process.env.ASW_LIVE_REX_CLAUDE_HOOKS === '1';
    const codexHooks = process.env.ASW_LIVE_REX_CODEX_HOOKS === '1';
    if (providers && (claudeHooks || codexHooks)) {
      hookPlugin = path.join(directory, 'com.kotl3r.deckshep.sdPlugin');
      fs.cpSync(path.resolve('dist/com.kotl3r.deckshep.sdPlugin'), hookPlugin, {
        recursive: true,
      });
      for (const [provider, enabled] of [
        ['claude', claudeHooks],
        ['codex', codexHooks],
      ]) {
        if (enabled)
          run(
            process.execPath,
            [path.join(hookPlugin, 'configure-' + provider + '.js'), '--apply'],
            options,
          );
      }
      if (claudeHooks)
        assert.equal(
          require('../../src/agents/claude/state').setupMode(hookPlugin),
          'hooks',
        );
    }
    if (providers && process.env.ASW_LIVE_AUTH === 'signed-in') {
      const verify = signedInCredentials(options.env);
      t.after(verify);
    }
    if (providers) {
      fs.writeFileSync(
        path.join(options.env.CODEX_HOME, 'config.toml'),
        '[projects.' + JSON.stringify(repo) + ']\ntrust_level = "trusted"\n',
        { mode: 0o600 },
      );
      const claudeSetup = JSON.stringify({
        hasCompletedOnboarding: true,
        theme: 'dark',
        projects: { [repo]: { hasTrustDialogAccepted: true } },
      });
      for (const home of [options.env.HOME, options.env.CLAUDE_CONFIG_DIR])
        fs.writeFileSync(path.join(home, '.claude.json'), claudeSetup, {
          mode: 0o600,
        });
    }
    const socket = path.join(directory, 'rex.sock');
    const address = 'unix://' + socket;
    const child = owned.spawn(
      rex,
      [
        'server',
        'run',
        '--listen',
        address,
        '--socket-mode',
        '0600',
        '--restore=false',
        '--state-dir',
        path.join(directory, 'rex-state'),
      ],
      options,
    );
    for (let attempt = 0; attempt < 100 && !fs.existsSync(socket); attempt++) {
      owned.assert(child.pid);
      await delay(50);
    }
    function command(args, input) {
      verifyListener(owned, child.pid, socket);
      return run(
        rex,
        ['--server', address, '--autostart=false', '--timeout', '2s', ...args],
        { ...options, input },
      );
    }
    const label = 'deckshep-test';
    command([
      'new',
      label,
      '--cwd',
      repo,
      '--shell',
      'none',
      '--json',
      '--',
      '/bin/cat',
    ]);
    const session = JSON.parse(
      command(['session', 'inspect', label, '--json']),
    );
    const window = session.windows.find(
      (item) => item.window_id === session.active_window_id,
    );
    assert(window?.focused_block_id);
    const target = ['-s', label, '-b', window.focused_block_id];
    const { foreground } = JSON.parse(
      command(['block', 'call', ...target, 'process']),
    );
    assert.equal(path.basename(foreground.name), 'cat');
    owned.observe(foreground.pid);
    command(['send', ...target, 'DeckShep-test-marker']);
    const screen = command(['capture', ...target, '--trim']);
    assert(
      screen.includes('DeckShep-test-marker'),
      'Disposable pane displays the test input',
    );
    if (providers) {
      const cases = ['permissions', 'plan', 'interrupt', 'queue', 'choice'];
      if (process.env.ASW_LIVE_REX_BROWSER === '1') cases.push('browser-ready');
      const selectedCases = process.env.ASW_LIVE_REX_CASES?.split(',');
      if (selectedCases) {
        const names = ['codex', 'claude'].flatMap((provider) =>
          (provider === 'claude'
            ? [...cases, 'effort', 'effort-fresh', 'effort-history']
            : [...cases, 'interrupt-stream', 'interrupt-stream-early']
          ).map((name) => provider + '-' + name),
        );
        assert(
          selectedCases.every((name) => names.includes(name)),
          'Unknown live Rex state case',
        );
      }
      for (const [provider, args] of [
        ['codex', ['--model', 'gpt-6-luna', '--no-daemon']],
        ['claude', ['--model', 'haiku']],
      ]) {
        if (process.env.ASW_LIVE_REX_STATES === '1') {
          for (const scenario of provider === 'claude'
            ? [...cases, 'effort', 'effort-fresh', 'effort-history']
            : [...cases, 'interrupt-stream', 'interrupt-stream-early']) {
            if (
              selectedCases &&
              !selectedCases.includes(provider + '-' + scenario)
            )
              continue;
            await t.test(provider + ' ' + scenario, async () => {
              let resume = [];
              if (scenario === 'effort-history') {
                const sessionId = require('node:crypto').randomUUID();
                const child = owned.spawn(
                  'claude',
                  [
                    '--model',
                    'haiku',
                    '--session-id',
                    sessionId,
                    '--tools',
                    '',
                    '-p',
                    'Reply with the word green.',
                  ],
                  { ...options, cwd: repo },
                );
                await new Promise((resolve, reject) => {
                  const timer = setTimeout(
                    () => reject(Error('Disposable Haiku turn timed out')),
                    45000,
                  );
                  child.once('exit', (code) => {
                    clearTimeout(timer);
                    if (code === 0) resolve();
                    else reject(Error('Disposable Haiku turn failed'));
                  });
                });
                resume = ['--resume', sessionId];
              }
              await checkPicker({
                hookPlugin:
                  provider === 'claude' && !claudeHooks
                    ? undefined
                    : hookPlugin,
                provider,
                args:
                  scenario === 'effort-fresh'
                    ? []
                    : scenario.startsWith('effort')
                      ? ['--model', 'sonnet', '--effort', 'xhigh', ...resume]
                      : provider === 'claude' &&
                          ['queue', 'interrupt'].includes(scenario)
                        ? [...args, '--allowedTools', 'Bash(sleep 14)']
                        : args,
                command,
                repo,
                owned,
                large:
                  provider !== 'claude' ||
                  !['effort', 'interrupt'].includes(scenario),
                scenario,
              });
            });
          }
          continue;
        }
        await t.test(provider + ' native model picker', async () => {
          await checkPicker({
            provider,
            args,
            command,
            repo,
            owned,
            hookPlugin,
          });
        });
      }
      if (process.env.ASW_LIVE_REX_STATES === '1') return;
      await t.test(
        'Claude enlarged model picker opens and cancels',
        async () => {
          await checkPicker({
            provider: 'claude',
            args: ['--model', 'haiku'],
            command,
            repo,
            owned,
            large: true,
            hookPlugin,
          });
        },
      );
    }
  },
);
