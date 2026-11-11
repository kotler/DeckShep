const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const {
  claudeKeyboardIdentity,
  registeredProcess,
} = require('../../src/agents/claude/keyboard-identity');
const {
  cycleClaudeKeyboard,
  readClaudeSettings,
} = require('../../src/agents/claude/keyboard-settings');
const {
  observeSettings,
  performRexKeyboard,
} = require('../../src/app/rex-keyboard-settings');
const { ClaudeKeyboardScreen } = require('../helpers/claude-keyboard-screen');
const agent = {
  app: 'claude-code',
  pid: 41,
  cwd: '/fixture',
  session: 'ses',
  block: 'block',
  window: 'window',
  name: 'claude',
  state: 'idle',
};

test('CLI registration uses UTC for both kernel start reads on a Pacific host', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-utc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const versions = path.join(dir, 'claude', 'versions');
  fs.mkdirSync(versions, { recursive: true });
  const executable = path.join(versions, '3.2.1');
  fs.writeFileSync(executable, 'fixture');
  const utc = 'Wed Nov 11 07:12:06 2026';
  let timeReads = 0;
  const fact = await registeredProcess(
    agent.pid,
    async (file, args, options) => {
      if (file === '/usr/sbin/lsof') return 'p41\nftxt\nn' + executable + '\n';
      timeReads++;
      const time = options.env.TZ === 'UTC' ? utc : 'Tue Nov 10 23:12:06 2026';
      return process.getuid() + ' 2 ' + time + ' ' + executable + '\n';
    },
  );
  assert.equal(fact.startedAt, utc);
  assert.equal(timeReads, 2);
  assert.equal(fact.version, '3.2.1');
});

test('interactive registration binds the foreground Claude process, session, directory and default shortcuts', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-claude-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'sessions'), { mode: 0o700 });
  const file = path.join(dir, 'sessions', '41.json'),
    start = 'Tue Nov 3 01:02:03 2026';
  const record = {
    pid: 41,
    entrypoint: 'cli',
    kind: 'interactive',
    pidDomain: 'darwin',
    procStart: start.replace('Nov 3', 'Nov  3'),
    cwd: agent.cwd,
    version: '3.2.1',
    sessionId: 'root-session',
  };
  const write = (overrides = {}) =>
    fs.writeFileSync(file, JSON.stringify({ ...record, ...overrides }), {
      mode: 0o600,
    });
  const read = () =>
    claudeKeyboardIdentity(
      agent,
      async () => ({
        pid: 41,
        version: '3.2.1',
        startedAt: start,
        executable: 'native',
      }),
      dir,
    );
  write();
  const first = await read();
  assert.match(first, /^[a-f0-9]{64}$/);
  write({ sessionId: 'other' });
  assert.notEqual(await read(), first);
  for (const changed of [
    { kind: 'sdk' },
    { cwd: '/other' },
    { pid: 42 },
    { version: '3.2.2' },
    { procStart: 'different' },
    { pidDomain: 'remote' },
    { entrypoint: 'sdk' },
    { sessionId: '' },
  ]) {
    write(changed);
    await assert.rejects(read(), /Check Claude CLI/);
  }
  write();
  fs.chmodSync(file, 0o666);
  await assert.rejects(read());
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(path.join(dir, 'keybindings.json'), '{}');
  await assert.rejects(read(), /Custom Claude keys/);
  fs.unlinkSync(path.join(dir, 'keybindings.json'));
  fs.renameSync(file, file + '.bak');
  fs.symlinkSync(file + '.bak', file);
  await assert.rejects(read());
});

test('picker cycles live labels, wraps effort at a native cap, and stops on drafts, changed lists and confirmations', async () => {
  const s = new ClaudeKeyboardScreen(),
    trace = [];
  const send = async (v, k) => {
    assert.equal(v.hash, s.view().hash);
    trace.push(k);
    s.send(k);
    return s.view();
  };
  s.effort = 2;
  assert.deepEqual(await cycleClaudeKeyboard(s.view(), send, 'effort', agent), {
    label: 'low',
  });
  assert.deepEqual(trace, ['alt+p', 'right', 'left', 'left', 's']);
  s.open = true;
  s.selected = s.model;
  assert.equal(readClaudeSettings(s.view()).model, 'Prairie 3');
  assert.equal(
    (await cycleClaudeKeyboard(s.view(), send, 'model', agent)).label,
    'Summit 8',
  );
  s.open = true;
  s.selected = 0;
  await assert.rejects(
    cycleClaudeKeyboard(s.view(), send, 'model', agent),
    /highlight/,
  );
  s.open = false;
  const initial = s.view();
  await assert.rejects(
    cycleClaudeKeyboard(
      { ...initial, text: initial.text.replace('❯ ', '❯ my draft') },
      send,
      'model',
      agent,
    ),
    /composer/,
  );
  let writes = [];
  await assert.rejects(
    cycleClaudeKeyboard(
      s.view(),
      async (v, k) => {
        writes.push(k);
        s.send(k);
        if (k === 'up') s.models[0] = 'Changed';
        return s.view();
      },
      'model',
      agent,
    ),
    /Picker changed/,
  );
  assert.deepEqual(writes, ['alt+p', 'up']);
  s.open = false;
  writes = [];
  await assert.rejects(
    cycleClaudeKeyboard(
      s.view(),
      async (v, k) => {
        writes.push(k);
        return { ...v, text: 'Continue using credits?', cursor: null };
      },
      'permissions',
      agent,
    ),
  );
  assert.deepEqual(writes, ['shift+tab']);
});

test('Claude settings explain an unverified empty prompt without sending a key', async () => {
  const idle = new ClaudeKeyboardScreen().view();
  for (const content of ['draft after the cursor', '\nwrapped draft']) {
    const view = { ...idle, text: idle.text.replace('❯ ', '❯ ' + content) };
    for (const action of ['model', 'effort', 'permissions', 'plan']) {
      const writes = [];
      await assert.rejects(
        cycleClaudeKeyboard(
          view,
          async (_view, key) => writes.push(key),
          action,
          agent,
        ),
        {
          keyLabel: 'Check input box',
          message:
            'DeckShep could not verify an empty Claude composer. Save any draft and return to the empty prompt in Rex.',
        },
      );
      assert.deepEqual(writes, []);
    }
  }
});

test('every Claude picker key rechecks the visible pane, registration and opt-in', async () => {
  for (const race of [
    'focus',
    'process',
    'consent',
    'view',
    'state',
    'uncertain',
  ]) {
    const s = new ClaudeKeyboardScreen(),
      trace = [];
    let changed = false;
    const b = {
      config: {
        backend: 'rex',
        allowClipboardFocus: true,
        claude: {
          get enabled() {
            return !(changed && race === 'consent');
          },
        },
      },
      assertDeliveryVisible() {},
      agent: async () => ({
        ...agent,
        state: changed && race === 'state' ? 'working' : 'idle',
      }),
      focused: async () => ({
        ...agent,
        block: changed && race === 'focus' ? 'switched' : agent.block,
      }),
      inspectClaudeKeyboard: async () =>
        changed && race === 'process' ? 'replacement' : 'initial',
      readKeyboardView: async () => s.view(),
      run: async (args) => {
        const key = args.at(-1);
        trace.push(key);
        s.send(key);
        changed = true;
        if (race === 'uncertain') throw Error('Uncertain delivery');
      },
    };
    const target = { ...agent, rexSettings: await observeSettings(b, agent) };
    if (race === 'view') s.plan = true;
    await assert.rejects(
      performRexKeyboard(b, { scope: 'rex', target, action: 'model' }),
    );
    assert.deepEqual(trace, race === 'view' ? [] : ['alt+p']);
  }
});

test('a newly opened clipped native model picker closes once and explains the required resize', async () => {
  const idle = new ClaudeKeyboardScreen().view();
  const clipped = [
    'Select model',
    'Switch between Claude models. Your choice is the default for new',
    'sessions. Use /model to switch.',
    '',
    '  1. Default (recommended)  Sonnet 5.5 · Balanced for general tasks',
    '  2. Sonnet                 Sonnet 5.5 · Balanced for general tasks',
    '  3. Fable                  Fable 5.2 · For complex work and',
    '                            longer running tasks',
    '  4. Opus                   Opus 5.5 · Advanced reasoning',
  ].join('\n');
  const run = async (initial, text, writes) =>
    cycleClaudeKeyboard(
      initial,
      async (_v, k) => {
        writes.push(k);
        return k === 'escape' ? idle : { ...idle, text, hash: 'opened' };
      },
      'model',
      agent,
    );
  let writes = [];
  await assert.rejects(run(idle, clipped, writes), {
    keyLabel: 'Enlarge pane',
  });
  assert.deepEqual(writes, ['alt+p', 'escape']);
  for (const text of [
    clipped + '\nContinue using additional credits?',
    clipped + '\n        Continue using additional credits',
    clipped.replace('2. Sonnet', '5. Sonnet'),
    clipped.replace('Switch between Claude models.', 'Unknown menu'),
  ]) {
    writes = [];
    await assert.rejects(run(idle, text, writes));
    assert.deepEqual(writes, ['alt+p']);
  }
  writes = [];
  await assert.rejects(run({ ...idle, text: clipped }, clipped, writes));
  assert.deepEqual(writes, []);
});

test('both Ready keys report the native manual mode badge after exactly one press', async () => {
  const idle = new ClaudeKeyboardScreen().view();
  for (const action of ['permissions', 'plan']) {
    const writes = [];
    const result = await cycleClaudeKeyboard(
      idle,
      async (_view, key) => {
        writes.push(key);
        return {
          ...idle,
          hash: 'manual',
          text: idle.text + '\n⏸ manual mode on · ? for shortcuts',
        };
      },
      action,
      agent,
    );
    assert.deepEqual(writes, ['shift+tab']);
    assert.deepEqual(result, { label: 'manual mode' });
  }
});
