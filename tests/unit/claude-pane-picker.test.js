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
  const read = (state = 'idle', surface) =>
    claudeKeyboardIdentity(
      { ...agent, state },
      async () => ({
        pid: 41,
        version: '3.2.1',
        startedAt: start,
        executable: 'native',
      }),
      dir,
      surface,
    );
  write();
  const first = await read();
  assert.match(first, /^[a-f0-9]{64}$/);
  await assert.rejects(read('unknown'));
  await assert.rejects(read('working'));
  write({ status: 'idle' });
  assert.equal(await read('unknown'), first);
  write({ status: 'waiting' });
  await assert.rejects(read('unknown'));
  assert.equal(await read('unknown', 'effort-slider'), first);
  write({ status: 'busy', statusUpdatedAt: 100 });
  await assert.rejects(read('unknown', 'effort-slider'));
  await assert.rejects(read('idle', 'effort-slider'));
  await assert.rejects(read('unknown'));
  const busy = await read('working');
  write({ status: 'busy', statusUpdatedAt: 100, updatedAt: 101 });
  assert.equal(await read('working'), busy);
  write({ status: 'busy', statusUpdatedAt: 102 });
  assert.notEqual(await read('working'), busy);
  write({ status: 'idle', statusUpdatedAt: 102 });
  await assert.rejects(read('working'));
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

test('without hooks or a status line, Interrupt needs the same working pane and current native hint at delivery', async () => {
  const border = '─'.repeat(32);
  const hint =
    '⏵⏵ accept edits on (shift+tab to cycle) · esc to interrupt · ← for agents';
  const working = [border, '❯ ', border, hint].join('\n');
  for (const race of [
    'none',
    'hint',
    'history',
    'draft',
    'focus',
    'turn',
    'consent',
    'process',
    'uncertain',
  ]) {
    const source = { ...agent, state: 'working', statusAt: 'first' };
    const writes = [];
    let reads = 0;
    const b = {
      config: {
        backend: 'rex',
        allowClipboardFocus: true,
        claude: { enabled: true },
      },
      claude: { submissions: new Map() },
      inspectClaudeKeyboard: async () =>
        reads && ['process', 'turn'].includes(race) ? 'replaced' : 'registered',
      agent: async () => source,
      focused: async () => ({
        ...source,
        ...(reads && race === 'focus' ? { block: 'another' } : {}),
      }),
      assertDeliveryVisible() {},
      readKeyboardText: async () => {
        reads++;
        source.statusAt = 'refreshed';
        if (race === 'consent') b.config.claude.enabled = false;
        if (race === 'history')
          return hint + '\n' + working.replace(hint, '? for shortcuts');
        if (race === 'draft') return working.replace('❯ ', '❯ draft');
        return reads === 2 && race === 'hint'
          ? working.replace(hint, '? for shortcuts')
          : working;
      },
      run: async (args) => {
        writes.push(args.at(-1));
        if (race === 'uncertain') throw Error('Delivery uncertain');
      },
    };
    const target = { ...source, rexSettings: await observeSettings(b, source) };
    const press = () =>
      performRexKeyboard(b, { scope: 'rex', action: 'interrupt', target });
    if (race === 'none') await press();
    else await assert.rejects(press);
    if (race === 'none' || race === 'uncertain')
      await assert.rejects(press, /already requested/);
    assert.deepEqual(
      writes,
      ['none', 'uncertain'].includes(race) ? ['escape'] : [],
      race,
    );
  }
});

test('all four fresh Claude settings work with the default shortcut footer and no status line', async () => {
  for (const action of ['model', 'effort', 'permissions', 'plan']) {
    const screen = new ClaudeKeyboardScreen();
    if (action === 'effort') screen.nativeEffort = true;
    const read = () => {
      const view = screen.view();
      return {
        ...view,
        text: view.text.replace(/^Claude .+$/m, '? for shortcuts'),
      };
    };
    const result = await cycleClaudeKeyboard(
      read(),
      async (_view, key) => {
        screen.send(key);
        return read();
      },
      action,
      agent,
    );
    assert(result.label);
  }
});

test('an empty composer with the current Claude spinner can interrupt when shortcuts are hidden', () => {
  const {
    hasClaudeInterruptCue,
  } = require('../../src/agents/claude/interrupt-cue');
  const border = '─'.repeat(30);
  const pane = (lines, footer = '') =>
    [...lines, border, '❯ ', border, footer].join('\n');
  const spinning = '✻ Thinking… (3s · ↓ 40 tokens)';
  assert(hasClaudeInterruptCue(pane([spinning])));
  assert(hasClaudeInterruptCue(pane(['✳ Working…', ''], '? for shortcuts')));
  assert(!hasClaudeInterruptCue(pane([spinning, 'A response has finished.'])));
  assert(
    !hasClaudeInterruptCue(
      pane([spinning], 'Enter to confirm · Esc to cancel'),
    ),
  );
  assert(!hasClaudeInterruptCue(pane(['Esc to interrupt'])));
  assert(
    !hasClaudeInterruptCue(pane([spinning]).replace('❯ ', '❯ unfinished')),
  );
});

test('native effort slider refuses a changed command, ambiguous marker, different level or missing session-only apply', async () => {
  for (const [at, edit, expected] of [
    [
      '/effort',
      (text) => text.replace('❯ /effort', '❯ /effort other'),
      ['/effort'],
    ],
    ['enter', (text) => text.replace('▲', '▲▲'), ['/effort', 'enter']],
    [
      'enter',
      (text) => text.replace('s for this session only', 'save default'),
      ['/effort', 'enter'],
    ],
    [
      'right',
      (text) => text.replace('───────────────▲', '─▲'),
      ['/effort', 'enter', 'right'],
    ],
    [
      's',
      (text) => text.replace('high · /effort', 'low · /effort'),
      ['/effort', 'enter', 'right', 's'],
    ],
  ]) {
    const screen = new ClaudeKeyboardScreen();
    screen.nativeEffort = true;
    const writes = [];
    await assert.rejects(
      cycleClaudeKeyboard(
        screen.view(),
        async (_, key, paste) => {
          assert.equal(!!paste, key === '/effort');
          writes.push(key);
          screen.send(key);
          screen.hideBadge = false;
          const view = screen.view();
          if (key === at) view.text = edit(view.text);
          return view;
        },
        'effort',
        agent,
      ),
    );
    assert.deepEqual(writes, expected);
  }
});

test('only the animated foreground colors of the native max slider label are interchangeable', () => {
  const {
    effortFrameIdentity,
  } = require('../../src/agents/claude/effort-slider');
  const footer =
    '←/→ to adjust · Enter to confirm · s for this session only · Esc to cancel';
  function frame(rgb, marker = '▲', style = '1') {
    const animated = [...'max']
      .map((c) => '\x1b[0m\x1b[' + style + 'm\x1b[38;2;' + rgb + 'm' + c)
      .join('');
    return (
      marker +
      '\nlow  medium  high  ' +
      animated +
      '   Tab to toggle\n' +
      footer
    );
  }
  const first = frame('145;200;130'),
    second = frame('245;139;87');
  assert.equal(
    effortFrameIdentity(first, footer),
    effortFrameIdentity(second, footer),
  );
  for (const different of [
    frame('145;200;130', ' ▲'),
    frame('145;200;130', '▲', '7'),
    first.replace('high', 'xhigh'),
    first.replace('toggle', 'enable'),
  ])
    assert.notEqual(
      effortFrameIdentity(first, footer),
      effortFrameIdentity(different, footer),
    );
  assert.equal(effortFrameIdentity(first, '? for shortcuts'), first);
});

test('only the captured effort badge may expire on the equal-width slider divider', () => {
  const {
    effortFrameIdentity,
  } = require('../../src/agents/claude/effort-slider');
  const footer =
    '←/→ to adjust · Enter to confirm · s for this session only · Esc to cancel';
  const reset = '\x1b[0m',
    color = '\x1b[38;2;177;185;249m';
  const badge = '◐ medium · /effort';
  const prefix = reset + color + '▔'.repeat(60);
  const visible =
    prefix +
    '\x1b[1C' +
    reset +
    '\x1b[38;2;153;153;153m' +
    badge +
    reset +
    color +
    ' ▔';
  const expired = prefix + '▔'.repeat(badge.length + 3);
  const frame = (line) =>
    line + reset + '\r\nEffort\n────────▲\nlow   medium\n' + footer;
  const id = (line, level = 'medium') =>
    effortFrameIdentity(frame(line), footer, level);
  assert.equal(id(visible), id(expired));
  assert.notEqual(id(visible, 'low'), id(expired, 'low'));
  assert.notEqual(id(visible), id(expired + '▔'));
  assert.notEqual(id(visible.replace(badge, '◉ xhigh · /effort')), id(expired));
  assert.notEqual(
    id(visible),
    effortFrameIdentity(frame(expired).replace('▲', '▶'), footer, 'medium'),
  );
});

test('Effort retries a torn slider observation without repeating a write', async () => {
  const screen = new ClaudeKeyboardScreen();
  screen.nativeEffort = true;
  const writes = [];
  let torn = true;
  const b = {
    config: {
      backend: 'rex',
      allowClipboardFocus: true,
      claude: { enabled: true },
    },
    agent: async () => agent,
    focused: async () => agent,
    assertDeliveryVisible() {},
    inspectClaudeKeyboard: async () => 'registered',
    method: async () => ({ modes: [{ number: 2004, set: true }] }),
    readKeyboardView: async () => {
      if (screen.slider && torn) {
        torn = false;
        throw Error('Rex view changed');
      }
      return screen.view();
    },
    run: async (args, input) => {
      const key = input ? input.slice(6, -6) : args.at(-1);
      writes.push(key);
      screen.send(key);
    },
  };
  const target = { ...agent, rexSettings: await observeSettings(b, agent) };
  assert.deepEqual(
    await performRexKeyboard(b, { scope: 'rex', action: 'effort', target }),
    { label: 'high' },
  );
  assert.deepEqual(writes, ['/effort', 'enter', 'right', 's']);
});

test('Effort from an empty Claude prompt with a dim Try hint, including identical draft text at the same cursor', async () => {
  const { stableViewport } = require('../../src/terminals/rex/viewport');
  const hint = 'Try "edit <filepath> to..."';
  const prompt = '❯\u00a0';
  const border = '─'.repeat(130);
  for (const kind of [
    'hint',
    'draft',
    'previous hint',
    'mixed style',
    'cursor moved',
    'second line',
  ]) {
    const screen = new ClaudeKeyboardScreen();
    screen.nativeEffort = true;
    const writes = [];
    async function read() {
      if (screen.command || screen.slider) return screen.view();
      const line = prompt + hint;
      const lines = [
        ...Array(45).fill(''),
        border,
        line,
        ...(kind === 'second line' ? ['draft'] : []),
        border,
        '? for shortcuts',
        '',
      ];
      const text = lines.join('\n');
      const styled = prompt + '\x1b[0m\x1b[2m' + hint + '\x1b[0m';
      const raw = lines.slice();
      raw[46] =
        kind === 'draft' || kind === 'previous hint'
          ? line
          : kind === 'mixed style'
            ? styled.replace('edit', '\x1b[0medit')
            : styled;
      if (kind === 'previous hint') raw[0] = styled;
      const vt =
        raw.join('\r\n') + '\x1b[47;' + (kind === 'cursor moved' ? 4 : 3) + 'H';
      return stableViewport(
        agent,
        async () => ({ content: vt }),
        async () => text,
      );
    }
    const b = {
      config: {
        backend: 'rex',
        allowClipboardFocus: true,
        claude: { enabled: true },
      },
      agent: async () => agent,
      focused: async () => agent,
      assertDeliveryVisible() {},
      inspectClaudeKeyboard: async () => 'registration',
      method: async () => ({ modes: [{ number: 2004, set: true }] }),
      readKeyboardView: read,
      run: async (args, input) => {
        const key = input ? input.slice(6, -6) : args.at(-1);
        writes.push(key);
        screen.send(key);
      },
    };
    const target = { ...agent, rexSettings: await observeSettings(b, agent) };
    const press = () =>
      performRexKeyboard(b, { scope: 'rex', action: 'effort', target });
    if (kind === 'hint') {
      assert.deepEqual(await press(), { label: 'high' });
      assert.deepEqual(writes, ['/effort', 'enter', 'right', 's']);
    } else {
      await assert.rejects(press(), { keyLabel: 'Check input box' });
      assert.deepEqual(writes, []);
    }
  }
});

test('an open xhigh slider stays actionable across shimmer frames and applies once', async () => {
  const { stableViewport } = require('../../src/terminals/rex/viewport');
  const {
    effortFrameIdentity,
  } = require('../../src/agents/claude/effort-slider');
  const reset = '\x1b[0m';
  const paint = (text, rgb) => reset + '\x1b[1m\x1b[38;2;' + rgb + 'm' + text;
  const base = '175;135;255',
    bright = '208;180;255';
  const phases = [
    paint('xhigh', base),
    paint('xhi', base) + paint('g', bright) + paint('h', base),
    paint('x', bright) + paint('high', base),
    paint('xhig', base) + paint('h', bright),
  ];
  const plain = [
    'Effort',
    'Faster                             Smarter',
    '──────────────────────────────▲───────────',
    'low     medium     high     xhigh      max',
    '~2.8x the estimated cost of medium (the default)',
    '←/→ to adjust · Enter to confirm · s for this session only · Esc to cancel',
  ].join('\n');
  const frame = (phase) => plain.replace('xhigh', phase + reset) + '\x1b[50;1H';
  const first = effortFrameIdentity(frame(phases[0]), plain);
  for (const phase of phases)
    assert.equal(effortFrameIdentity(frame(phase), plain), first);
  for (const changed of [
    frame(phases[0]).replace('▲─', '─▲'),
    frame(phases[0]).replace('medium', 'medium!'),
    frame(phases[0]).replace('[1m', '[7m'),
  ]) {
    assert.notEqual(effortFrameIdentity(changed, plain), first);
  }
  let tick = 0;
  const writes = [];
  const pane = { ...agent, state: 'unknown' };
  const ready = new ClaudeKeyboardScreen();
  ready.nativeEffort = true;
  ready.hideBadge = true;
  const b = {
    config: {
      backend: 'rex',
      allowClipboardFocus: true,
      claude: { enabled: true },
    },
    agent: async () => pane,
    focused: async () => pane,
    assertDeliveryVisible() {},
    inspectClaudeKeyboard: async () => 'registration',
    readKeyboardView: async (_, identity) =>
      writes.length
        ? ready.view()
        : stableViewport(
            pane,
            async () => ({ content: frame(phases[tick++ % phases.length]) }),
            async () => plain,
            identity,
          ),
    run: async (args) => {
      writes.push(args.at(-1));
    },
  };
  for (let i = 0; i < 3; i++) {
    pane.rexSettings = await observeSettings(b, pane);
    assert.equal(pane.rexSettings.effortSlider, true);
    assert.equal(pane.rexSettings.effort, 'xhigh');
  }
  assert.deepEqual(
    await performRexKeyboard(b, {
      scope: 'rex',
      action: 'effort',
      target: pane,
    }),
    { label: 'xhigh' },
  );
  assert.deepEqual(writes, ['s']);
});
