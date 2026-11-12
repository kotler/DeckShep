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
}) {
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
  async function read(frameIdentity) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await stableViewport(
          target,
          run,
          () => setup.screen(target),
          frameIdentity,
        );
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
  const view = await read();
  if (/sign in|log in|login method|select a login/i.test(view.text))
    throw Error('Private provider requires sign-in');
  if (/trust.*(folder|directory)|trust this workspace/i.test(view.text))
    throw Error('Private repository trust prompt');
  await assertEmpty(view);
  if (scenario)
    return require('./rex-states.cjs').checkState({
      scenario,
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
