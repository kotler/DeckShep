const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

async function checkPicker({
  provider,
  args,
  command,
  repo,
  owned,
  large = false,
  scenario,
  hookPlugin,
}) {
  const streamAtLaunch =
    provider === 'codex' && scenario?.startsWith('interrupt-stream');
  const { stableViewport } = require('../../src/terminals/rex/viewport');
  const { Setup } = require('../../src/agents/codex/setup-presets');
  const {
    cycleCodexSetting,
  } = require('../../src/agents/codex/keyboard-settings');
  const {
    cycleClaudeKeyboard,
  } = require('../../src/agents/claude/keyboard-settings');
  const session =
    'test-' + provider + (scenario ? '-' + scenario : large ? '-large' : '');
  const size = large ? { columns: 132, rows: 48 } : { columns: 80, rows: 24 };
  const sessionId =
    provider === 'claude' && scenario === 'queue'
      ? require('node:crypto').randomUUID()
      : undefined;
  command([
    'new',
    session,
    '--cwd',
    repo,
    '--shell',
    'none',
    '--',
    provider,
    ...args,
    ...(streamAtLaunch
      ? [
          'Without tools, write 500 lines. Each line must say CALIBRATION followed by its number.',
        ]
      : []),
    ...(sessionId ? ['--session-id', sessionId] : []),
  ]);
  const topology = JSON.parse(
    command(['session', 'inspect', session, '--json']),
  );
  const block = topology.windows.find(
    (w) => w.window_id === topology.active_window_id,
  )?.focused_block_id;
  assert(block);
  const target = {
    session,
    block,
    cwd: repo,
    app: provider === 'codex' ? 'codex' : 'claude-code',
  };
  const route = ['-s', session, '-b', block];
  const run = (args) => JSON.parse(command(args));
  const method = (_, name) => run(['block', 'call', ...route, name]);
  if (large) {
    const script = [
      'local loc = {session_id = rex.args.session, block_ids = {rex.args.block}}',
      'rex.call("session.own_block", loc)',
      'return rex.call("com.superlogical.terminal.resize", {session_id = rex.args.session, block_id = rex.args.block, args = {columns = 132, rows = 48}})',
    ].join('\n');
    command([
      'do',
      '-s',
      session,
      '-e',
      script,
      '--args',
      JSON.stringify({ session: topology.session_id, block }),
    ]);
  }
  const actual = method(target, 'size');
  assert(
    actual.rows === size.rows && actual.columns === size.columns,
    'Unexpected private pane dimensions',
  );
  const setup = new Setup({ run, method });
  // Opt-in frame recording (ASW_RECORD_FRAMES=1) for the screen corpus in
  // tests/fixtures/screens. It only observes reads this harness already makes
  // of its own private pane, and is inert for a provider whose release cannot
  // be read from the foreground path.
  let frameRecorder = null;
  function frames() {
    if (frameRecorder) return frameRecorder;
    let version = '';
    try {
      version =
        /\/versions\/(\d+\.\d+\.\d+)$/.exec(
          method(target, 'process').foreground?.path || '',
        )?.[1] || '';
    } catch {
      /* No readable release: recording stays off. */
    }
    frameRecorder = require('../helpers/screen-corpus.cjs').recorder({
      provider,
      version,
      scenario: scenario || (large ? 'picker-large' : 'picker'),
      secrets: [repo],
    });
    return frameRecorder;
  }
  async function read(frameIdentity) {
    for (let attempt = 0; ; attempt++) {
      try {
        const view = await stableViewport(
          target,
          frames().tap(run),
          () => setup.screen(target),
          frameIdentity,
        );
        frames().save(view);
        return view;
      } catch (error) {
        if (error.message !== 'Rex view changed' || attempt === 4) throw error;
        await delay(100);
      }
    }
  }
  await delay(3500);
  const identity = method(target, 'process').foreground;
  assert(
    identity?.pid && identity.cwd === repo,
    'Provider foreground unavailable',
  );
  owned.observe(identity.pid);
  if (provider === 'claude' && hookPlugin) {
    const state = require('../../src/agents/claude/state');
    const hookDir = require('node:path').join(hookPlugin, 'state/claude');
    const record = state.readRecord(identity.pid, hookDir);
    state.validate(
      record,
      { pid: identity.pid, cwd: repo },
      await state.processInfo(identity.pid),
    );
  }
  function assertOwnedPane() {
    const current = method(target, 'process').foreground;
    assert(
      current?.pid === identity.pid &&
        current.name === identity.name &&
        current.cwd === identity.cwd,
    );
    owned.assert(current.pid);
  }
  function writeOwned(verb, ...values) {
    assertOwnedPane();
    command([verb, ...route, ...values]);
  }
  async function readOwnedAgent() {
    assertOwnedPane();
    const { Bridge } = require('../../src/app/session');
    const pane = await Bridge.prototype.agent.call(
      { method, config: {} },
      { ...target, window: topology.active_window_id },
      true,
    );
    assert.equal(pane?.pid, identity.pid);
    return pane;
  }
  async function deliver(view, verb, value, readBack = true) {
    assert((await read()).hash === view.hash, 'Provider view changed');
    frames().note(verb === 'send-key' ? value : 'text');
    writeOwned(verb, value);
    await delay(650);
    if (!readBack) return;
    return read();
  }
  let opened = false;
  let typed = false;
  let cancelled = false;
  const finished = Symbol();
  async function key(view, name) {
    if (
      !opened &&
      (provider === 'codex' ? typed && name === 'enter' : name === 'alt+p')
    ) {
      opened = true;
      const next = await deliver(view, 'send-key', name);
      if (provider === 'claude' && large) {
        // Verify cancellation independently of the shortcut used to apply a model.
        const lines = next.text.trimEnd().split('\n');
        const title = lines.findLastIndex((line) =>
          /^\s*(Select|Choose) model\s*$/.test(line),
        );
        assert(
          title >= 0 &&
            lines
              .slice(title + 1)
              .some((line) => /^\s*[❯›>]\s*\d+[.)]\s+/.test(line)),
          'Expected visible Claude model selection',
        );
        const footer = lines
          .filter((line) => line.trim() && !/^[─━\s]+$/.test(line))
          .at(-1);
        assert(
          /\bEsc to (?:exit|cancel)\b/i.test(footer),
          'Expected visible native cancellation hint',
        );
        await assertEmpty(await deliver(next, 'send-key', 'escape'));
        throw finished;
      }
      return next;
    }
    if (provider === 'claude' && opened && name === 'escape') {
      const after = await deliver(view, 'send-key', 'escape');
      await assertEmpty(after);
      cancelled = true;
      return after;
    }
    // The production parser requests its first movement only after recognizing the picker.
    assert(
      opened && ['down', 'up', 'enter'].includes(name),
      'Expected verified native picker',
    );
    const after = await deliver(view, 'send-key', 'escape');
    await assertEmpty(after);
    throw finished;
  }
  async function assertEmpty(view) {
    const empty = Symbol();
    const intercept = async () => {
      throw empty;
    };
    try {
      if (provider === 'codex') {
        await cycleCodexSetting(
          {
            read: () => view,
            paste: intercept,
            key: async () => {
              throw Error('Expected idle composer');
            },
          },
          'model',
        );
      } else {
        await cycleClaudeKeyboard(
          view,
          async (_, name) => {
            assert.equal(name, 'alt+p');
            throw empty;
          },
          'model',
          target,
        );
      }
    } catch (error) {
      if (error === empty) return;
      throw error;
    }
    throw Error('Expected empty composer');
  }
  let view = streamAtLaunch ? undefined : await read();
  if (view) {
    if (/sign in|log in|login method|select a login/i.test(view.text))
      throw Error('Private provider requires sign-in');
    if (/trust.*(folder|directory)|trust this workspace/i.test(view.text))
      throw Error('Private repository trust prompt');
    if (
      provider === 'codex' &&
      process.env.ASW_LIVE_REX_CODEX_HOOKS === '1' &&
      view.text.includes('Hooks need review')
    ) {
      const fs = require('node:fs'),
        path = require('node:path');
      const root = path.dirname(repo);
      assert.equal(hookPlugin, path.join(root, 'com.kotl3r.deckshep.sdPlugin'));
      const quote = (value) => "'" + value.replace(/'/g, "'\\''") + "'";
      const expected =
        quote(process.execPath) +
        ' ' +
        quote(path.join(hookPlugin, 'codex-hook.js'));
      const { hooks } = JSON.parse(
        fs.readFileSync(path.join(root, 'home/.codex/hooks.json'), 'utf8'),
      );
      assert.deepEqual(Object.keys(hooks).sort(), [
        'SessionEnd',
        'SessionStart',
        'UserPromptSubmit',
      ]);
      for (const entries of Object.values(hooks))
        assert.deepEqual(entries, [
          {
            hooks: [
              { type: 'command', command: expected, timeout: 5, async: false },
            ],
          },
        ]);
      assert(
        /3 hooks are new or changed/.test(view.text) &&
          /› 1\. Review hooks/.test(view.text),
      );
      const highlighted = await deliver(view, 'send-key', 'down');
      assert(/› 2\. Trust all and continue/.test(highlighted.text));
      await deliver(highlighted, 'send-key', 'enter');
      // SessionStart preceded the trust decision. The first real prompt
      // supplies UserPromptSubmit in the newly trusted disposable home.
      await delay(1500);
      const ready = await read();
      await assertEmpty(ready);
      const typed = await deliver(ready, 'send', 'Reply only with OK.');
      assert(
        typed.text
          .split('\n')
          .some((line) => /^› Reply only with OK\.\s*$/.test(line)),
      );
      await deliver(typed, 'send-key', 'enter', false);
      const until = Date.now() + 45000;
      while (Date.now() < until) {
        const output = await setup.screen(target);
        if (/^\s*(?:•\s*)?OK[.!]?\s*$/im.test(output)) break;
        await delay(250);
      }
      await delay(1500);
      view = await read();
    }
    await assertEmpty(view);
    if (provider === 'codex' && process.env.ASW_LIVE_REX_CODEX_HOOKS === '1') {
      const fs = require('node:fs'),
        path = require('node:path');
      const {
        hookRecord,
        digest,
      } = require('../../src/agents/codex/hook-contract');
      const dir = path.join(hookPlugin, 'state/codex');
      const reports = fs
        .readdirSync(dir)
        .filter((name) => /^\d+-[a-f0-9-]{36}\.json$/.test(name))
        .map((name) =>
          hookRecord.parse(
            require('../../src/agents/codex/hook-files').readPrivate(
              path.join(dir, name),
            ),
          ),
        );
      assert(
        reports.some(
          (r) =>
            r.block === block &&
            r.session === topology.session_id &&
            r.cwdHash === digest(repo) &&
            !r.ended,
        ),
        'Expected a live Codex hook report for this disposable pane',
      );
    }
  }
  const pressDeck = (action) =>
    require('./rex-browser-deck.cjs').checkBrowserDeck({
      provider,
      action,
      topology,
      block,
      repo,
      command,
      assertOwnedPane,
      read,
      hookPlugin,
    });
  if (scenario === 'browser-ready') return pressDeck('ready');
  if (scenario)
    return require('./rex-states.cjs').checkState({
      scenario,
      pressDeck,
      provider,
      target,
      read,
      run,
      deliver,
      assertEmpty,
      screen: () => setup.screen(target),
      writeOwned,
      effortBridge: scenario?.startsWith('effort')
        ? {
            config: {
              backend: 'rex',
              allowClipboardFocus: true,
              claude: { enabled: true },
            },
            assertDeliveryVisible: assertOwnedPane,
            agent: readOwnedAgent,
            focused: async () => {
              const current = JSON.parse(
                command(['session', 'inspect', session, '--json']),
              );
              assert.equal(
                current.windows.find(
                  (w) => w.window_id === current.active_window_id,
                )?.focused_block_id,
                block,
              );
              assertOwnedPane();
              return readOwnedAgent();
            },
            inspectClaudeKeyboard: (a, _inspect, _directory, surface) =>
              require('../../src/agents/claude/keyboard-identity').claudeKeyboardIdentity(
                a,
                undefined,
                require('node:path').join(repo, '../home/.claude'),
                surface,
              ),
            readKeyboardText: () => setup.screen(target),
            readKeyboardView: require('../../src/app/session').Bridge.prototype
              .readKeyboardView,
            method,
            run: async (args, input) => {
              if (args[0] === 'block') return run(args);
              assert.deepEqual(args.slice(1, 5), route);
              assertOwnedPane();
              command(args, input);
            },
          }
        : undefined,
      sessionId,
      hookPlugin,
      owned,
      pid: identity.pid,
      repo,
    });
  try {
    if (provider === 'codex') {
      await cycleCodexSetting(
        {
          read: () => view,
          key,
          paste: async (before, value) => {
            assert(!typed && value === '/model');
            typed = true;
            return deliver(before, 'send', value);
          },
        },
        'model',
      );
    } else await cycleClaudeKeyboard(view, key, 'model', target);
  } catch (error) {
    if (!large && provider === 'claude' && error.keyLabel === 'Enlarge pane') {
      assert(cancelled, 'Clipped picker must return to the empty composer');
      return;
    }
    if (error === finished) return;
    throw error;
  }
  throw Error('Native picker round trip incomplete');
}
module.exports = { checkPicker };
