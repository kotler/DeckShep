const { test } = require('node:test');
const assert = require('node:assert/strict');
const { KeyboardScreen } = require('../helpers/keyboard-screen');
const {
  cycleCodexSetting,
  readCodexSettings,
} = require('../../src/agents/codex/keyboard-settings');
const {
  observeSettings,
  performRexKeyboard,
} = require('../../src/app/rex-keyboard-settings');
function fixture() {
  const screen = new KeyboardScreen();
  const write = async (view, key) => {
    assert.equal(screen.view().hash, view.hash);
    screen.send(key);
    return screen.view();
  };
  return {
    screen,
    port: { read: async () => screen.view(), paste: write, key: write },
  };
}
test('native two-line footer permits Model on an empty prompt and rejects an extra draft line', async () => {
  for (const tail of [
    '? for shortcuts',
    '? for shortcuts     ⚠ 1 warning · f2 to view',
    '← for agents · ? for shortcuts             ⚠ 1 warning · f2 to view',
    '                                 ⚠ 1 warning · f2 to view',
    'unrecognized draft text',
  ]) {
    const { port, screen } = fixture();
    const read = async () => {
      const view = await port.read();
      return { ...view, text: view.text + '\n  ' + tail };
    };
    if (tail !== 'unrecognized draft text') {
      await cycleCodexSetting({ ...port, read }, 'model');
      assert.equal(screen.model, 1);
      assert.equal(screen.effort, 1);
    } else {
      await assert.rejects(cycleCodexSetting({ ...port, read }, 'model'), {
        keyLabel: 'Check Codex',
        message: /lines beneath the Codex prompt/,
      });
      assert.deepEqual(screen.trace, []);
    }
  }
});
test('unrecognized text next to the native agent shortcut or warning blocks writes', async () => {
  for (const tail of [
    'draft ← for agents · ? for shortcuts',
    '← for agents · ? for shortcuts    ⚠ 1 warning · f2 to view plus text',
    'draft    ⚠ 1 warning · f2 to view',
  ]) {
    const { port, screen } = fixture();
    const read = async () => ({
      ...screen.view(),
      text: screen.view().text + '\n  ' + tail,
    });
    await assert.rejects(cycleCodexSetting({ ...port, read }, 'model'), {
      keyLabel: 'Check Codex',
    });
    assert.deepEqual(screen.trace, []);
  }
});
test('model reads missing effort from native pickers and applies only to this session; Effort never changes model', async () => {
  const { screen, port } = fixture();
  screen.hideFooter = true;
  await cycleCodexSetting(port, 'model');
  assert.deepEqual(screen.trace, [
    '/model',
    'enter',
    'enter',
    'enter',
    'escape',
    'down',
    'enter',
    's',
  ]);
  assert.equal(screen.model, 1);
  assert.equal(screen.effort, 1);
  await cycleCodexSetting(port, 'effort');
  assert.equal(screen.model, 1);
  assert.equal(screen.effort, 2);
  await cycleCodexSetting(port, 'effort');
  assert.equal(screen.effort, 0);
});
test('footer and picker follow the displayed model names across catalog changes', async () => {
  const { screen, port } = fixture();
  screen.showShortcutRow = true;
  for (const names of [
    ['Orbit/小 2.0', 'Workshop: Fast'],
    ['Future +', 'Another Alias'],
  ]) {
    screen.models = names;
    screen.model = 0;
    assert.equal(readCodexSettings(screen.view()).model, names[0]);
    await cycleCodexSetting(port, 'model');
    assert.equal(readCodexSettings(screen.view()).model, names[1]);
    await cycleCodexSetting(port, 'model');
    assert.equal(readCodexSettings(screen.view()).model, names[0]);
    assert.equal(screen.effort, 1);
  }
});
test('session-ID-first Codex footer keeps Model and Effort visible and usable', async () => {
  const { screen, port } = fixture();
  const original = screen.view.bind(screen);
  const id = '00000000-0000-4000-8000-000000000001';
  screen.showShortcutRow = true;
  screen.view = () => {
    const view = original();
    if (screen.surface === 'idle')
      view.text = view.text.replace('  GPT-', '  ' + id + ' · GPT-');
    return view;
  };
  const settings = () => readCodexSettings(screen.view());
  assert.equal(settings().model, screen.models[0]);
  assert.equal(settings().effort, 'high');
  await cycleCodexSetting(port, 'model');
  assert.equal(settings().model, screen.models[1]);
  await cycleCodexSetting(port, 'effort');
  assert.equal(settings().effort, 'xhigh');
  const malformed = screen.view();
  malformed.text = malformed.text.replace(id, 'project name');
  assert.equal(readCodexSettings(malformed).model, undefined);
});
test('Permissions skips Full Access, wraps, and recovers from its old confirmation', async () => {
  const { screen, port } = fixture();
  await cycleCodexSetting(port, 'permissions');
  assert.equal(screen.permissions, 1);
  await cycleCodexSetting(port, 'permissions');
  assert.equal(screen.permissions, 3);
  assert.equal(screen.surface, 'idle');
  await cycleCodexSetting(port, 'permissions');
  assert.equal(screen.permissions, 0);
  screen.permissions = 1;
  screen.surface = 'confirm';
  screen.trace.length = 0;
  await cycleCodexSetting(port, 'permissions');
  assert.deepEqual(screen.trace, ['escape', 'down', 'enter']);
  assert.equal(screen.permissions, 3);
  screen.permissions = 2;
  await cycleCodexSetting(port, 'permissions');
  assert.equal(screen.permissions, 3);
});
test('Model can cycle from the current row of an already-open model picker without pasting a command', async () => {
  const { screen, port } = fixture();
  screen.surface = 'models';
  screen.selected = 1;
  await assert.rejects(cycleCodexSetting(port, 'model'), {
    keyLabel: 'Check selection',
  });
  assert.deepEqual(screen.trace, []);
  screen.selected = screen.model;
  await cycleCodexSetting(port, 'model');
  assert(!screen.trace.includes('/model'));
  assert.equal(screen.model, 1);
  assert.equal(screen.effort, 1);
  assert.equal(screen.surface, 'idle');
});
test('mode enters Plan by command and uses the visible cycle hint to leave it', async () => {
  const { screen, port } = fixture();
  await cycleCodexSetting(port, 'plan');
  assert.equal(readCodexSettings(screen.view()).plan, 'Plan');
  await cycleCodexSetting(port, 'plan');
  assert.equal(screen.plan, false);
  assert.deepEqual(screen.trace, ['/plan', 'enter', 'shift+tab']);
});
test('drafts, changed commands and an unexpected menu cannot receive follow-on keys', async () => {
  const { screen, port } = fixture();
  screen.draft = 'draft';
  await assert.rejects(cycleCodexSetting(port, 'permissions'), {
    keyLabel: 'Check input box',
  });
  await assert.rejects(
    cycleCodexSetting(
      {
        ...port,
        read: async () => ({ ...screen.view(), cursor: { row: 1, column: 8 } }),
      },
      'permissions',
    ),
    { keyLabel: 'Draft in Codex', message: /Finish or save the draft/ },
  );
  assert.deepEqual(screen.trace, []);
  screen.draft = '';
  const paste = async (v, k) => {
    await port.paste(v, k);
    screen.command += 'other';
    return screen.view();
  };
  await assert.rejects(cycleCodexSetting({ ...port, paste }, 'permissions'));
  assert.deepEqual(screen.trace, ['/permissions']);
  screen.surface = 'confirm';
  await assert.rejects(cycleCodexSetting(port, 'model'));
  assert.equal(screen.trace.length, 1);
});
test('passive reads use native controls, ignore transcript and ambiguous current markers', () => {
  const { screen } = fixture();
  screen.surface = 'profiles';
  screen.selected = 2;
  assert.deepEqual(readCodexSettings(screen.view()), {
    permissions: 'Ask for approval',
  });
  let view = screen.view();
  view.text = view.text.replace('Approve for me', 'Approve for me (current)');
  assert.throws(() => readCodexSettings(view));
  screen.surface = 'idle';
  screen.hideFooter = true;
  view = screen.view();
  view.text = '  GPT-6-Astra high\n' + view.text;
  view.cursor.row++;
  assert.equal(readCodexSettings(view).model, undefined);
});
test('a captured process, view, focus and consent must survive every macro write; none imply a thread identity', async () => {
  for (const race of [
    'pid',
    'view',
    'focus',
    'consent',
    'state',
    'uncertain',
  ]) {
    const { screen } = fixture(),
      agent = {
        app: 'codex',
        name: 'codex',
        pid: 44,
        block: 'a',
        session: 's',
        state: 'idle',
        cwd: 'fixture',
      };
    let start = '1',
      block = 'a',
      currentState = 'idle',
      allowed = true;
    const b = {
      config: {
        backend: 'rex',
        get allowClipboardFocus() {
          return allowed;
        },
        controlVerified: { codex: true },
      },
      assertDeliveryVisible() {},
      agent: async () => ({ ...agent, state: currentState }),
      focused: async () => ({ ...agent, block, state: currentState }),
      inspectKeyboardProcess: async () => ({
        pid: 44,
        codex: true,
        startedAt: start,
        image: 'image',
      }),
      method: async () => ({ modes: [{ number: 2004, set: true }] }),
      readKeyboardView: async () => screen.view(),
      run: async (args, input) => {
        assert.equal(args[0], 'send');
        screen.send(input.slice(6, -6));
        if (race === 'pid') start = '2';
        if (race === 'focus') block = 'b';
        if (race === 'consent') allowed = false;
        if (race === 'state') currentState = 'working';
        if (race === 'uncertain') throw Error('Uncertain write');
      },
    };
    const target = { ...agent, rexSettings: await observeSettings(b, agent) };
    if (race === 'view') screen.draft = 'changed';
    await assert.rejects(
      performRexKeyboard(b, { scope: 'rex', target, action: 'model' }),
    );
    assert.deepEqual(screen.trace, race === 'view' ? [] : ['/model']);
  }
});

test('Rex text and cursor are bracketed by identical terminal frames', async () => {
  const { stableViewport } = require('../../src/terminals/rex/viewport');
  const target = { session: 's', block: 'b' },
    frame = { content: 'data\x1b[2;3H' };
  const view = await stableViewport(
    target,
    async () => frame,
    async () => 'visible only',
  );
  assert.deepEqual(view.cursor, { row: 2, column: 3 });
  assert.equal(view.text, 'visible only');
  await assert.rejects(
    stableViewport(
      target,
      async () => ({ content: 'text' }),
      async () => '',
    ),
  );
  let n = 0;
  await assert.rejects(
    stableViewport(
      target,
      async () => (n++ ? { content: 'changed' } : frame),
      async () => '',
    ),
  );
});
test('a hidden cursor allows a stable Codex picker frame and cannot authorize a composer write', async () => {
  const { stableViewport } = require('../../src/terminals/rex/viewport');
  const { screen, port } = fixture();
  const target = { session: 's', block: 'b', app: 'codex' };
  screen.surface = 'models';
  const run = async (args) =>
    args.at(-1) === 'modes'
      ? { modes: [{ number: 25, set: false }] }
      : { content: 'native picker frame without final cursor position' };
  const view = await stableViewport(
    target,
    run,
    async () => screen.view().text,
  );
  assert.equal(view.cursor, null);
  assert.equal(readCodexSettings(view).model, screen.models[0]);
  screen.surface = 'idle';
  await assert.rejects(
    cycleCodexSetting(
      { ...port, read: async () => ({ ...view, text: screen.view().text }) },
      'model',
    ),
  );
  assert.deepEqual(screen.trace, []);
  for (const modes of [
    [],
    [{ number: 25, set: true }],
    [
      { number: 25, set: false },
      { number: 25, set: true },
    ],
  ]) {
    await assert.rejects(
      stableViewport(
        target,
        async (args) => (args.at(-1) === 'modes' ? { modes } : run(args)),
        async () => screen.view().text,
      ),
    );
  }
});

test('the native context-only footer after typing a command can open the picker; extra composer text cannot', async () => {
  const { screen, port } = fixture();
  const paste = async (v, k) => {
    const typed = await port.paste(v, k);
    return {
      ...typed,
      text: '› ' + k + '\n\n                    100% context left',
    };
  };
  await cycleCodexSetting({ ...port, paste }, 'effort');
  assert.equal(screen.effort, 2);
  assert.equal(screen.model, 0);
  const altered = async (v, k) => {
    const typed = await paste(v, k);
    return { ...typed, text: typed.text + ' plus text' };
  };
  await assert.rejects(
    cycleCodexSetting({ ...port, paste: altered }, 'model'),
    /Command changed/,
  );
});

test('unbound Interrupt requires fresh working evidence and sends Escape at most once', async () => {
  for (const race of [
    'ok',
    'repaint',
    'hint then draft',
    'time',
    'process',
    'focus',
    'hint',
    'history',
    'consent',
    'uncertain',
  ]) {
    const { screen } = fixture();
    screen.surface = 'working';
    const agent = {
      session: 's',
      block: 'a',
      window: 'w',
      app: 'codex',
      name: 'codex',
      pid: 44,
      cwd: '/fixture',
      state: 'working',
      statusAt: 'run-1',
    };
    const inputs = [];
    let frames = 0;
    const b = {
      config: {
        backend: 'rex',
        allowClipboardFocus: race !== 'consent',
        controlVerified: { codex: true },
      },
      assertDeliveryVisible() {},
      inspectKeyboardProcess: async () => ({
        pid: 44,
        codex: true,
        startedAt: race === 'process' ? 'replaced' : 'start',
        image: 'image',
      }),
      focused: async () => ({ ...agent, block: race === 'focus' ? 'b' : 'a' }),
      agent: async () => ({
        ...agent,
        statusAt: race === 'time' ? 'run-2' : 'run-1',
      }),
      readKeyboardView: async () => {
        if (race === 'repaint' && frames++ === 0)
          throw Error('Rex view changed');
        const v = screen.view();
        if (race === 'hint then draft' && frames++ > 0)
          v.text = v.text.replace('Ask Codex to do anything', 'unfinished');
        if (race === 'hint')
          v.text = v.text.replace('esc to interrupt', 'esc to dismiss');
        if (race === 'history') {
          v.text = v.text.replace('\n\n›', '\nold transcript\n›');
        }
        return v;
      },
      run: async (args) => {
        inputs.push(args.at(-1));
        if (race === 'uncertain') throw Error('Uncertain');
      },
    };
    const run = performRexKeyboard(b, {
      scope: 'rex',
      action: 'interrupt',
      target: { ...agent, rexSettings: { process: 'start:image' } },
    });
    if (race === 'ok' || race === 'repaint') await run;
    else await assert.rejects(run);
    assert.deepEqual(
      inputs,
      ['ok', 'repaint', 'uncertain'].includes(race) ? ['escape'] : [],
    );
  }
});

test('Codex streaming Interrupt requires advancing output at the verified composer', async () => {
  const target = {
    app: 'codex',
    name: 'codex',
    pid: 44,
    cwd: '/fixture',
    session: 's',
    window: 'w',
    block: 'a',
    state: 'working',
    statusAt: 'run-1',
    rexSettings: { process: 'start:image' },
  };
  for (const scenario of [
    'growing',
    'scrolled',
    'pinned header',
    'chunk delay',
    'unrelated repaint',
    'repainting moving prompt',
    'repainting output',
    'repainting draft',
    'repainting footer',
    'repainting cursor',
    'static',
    'draft',
    'dialog',
    'focus',
    'turn',
  ]) {
    const inputs = [];
    let frames = 0;
    const bridge = {
      config: {
        backend: 'rex',
        allowClipboardFocus: true,
        controlVerified: { codex: true },
      },
      assertDeliveryVisible() {},
      inspectKeyboardProcess: async () => ({
        pid: 44,
        codex: true,
        startedAt: 'start',
        image: 'image',
      }),
      focused: async () =>
        scenario === 'focus' && frames ? { ...target, block: 'other' } : target,
      agent: async () =>
        scenario === 'turn' && frames
          ? { ...target, statusAt: 'run-2' }
          : target,
      readKeyboardView: async (_, frameIdentity, atomicComposer) => {
        const later = frames++ > 0;
        const lines = ['previous line', 'first number', 'second number'];
        if (
          later &&
          scenario !== 'static' &&
          (scenario !== 'chunk delay' || frames >= 3)
        )
          lines.push('third number');
        if (scenario === 'pinned header') {
          if (later) lines.shift();
          lines.unshift('Pinned title');
        }
        if (later && scenario === 'unrelated repaint')
          lines.splice(
            0,
            lines.length,
            'unrelated menu title',
            'unrelated content',
          );
        if (later && scenario === 'scrolled') lines.shift();
        lines.push(
          '',
          scenario === 'draft' ? '› unfinished' : '› ',
          '',
          '  GPT-6-Luna low · project',
        );
        if (scenario === 'dialog') lines.push('  Enter to confirm');
        if (scenario.startsWith('repainting')) {
          const {
            stableViewport,
          } = require('../../src/terminals/rex/viewport');
          const row = lines.indexOf('') + 2;
          const text = lines.join('\n');
          const vt =
            text
              .replace(
                'previous line',
                '\x1b]8;;https://example.invalid\x1b\\previous line\x1b]8;;\x1b\\',
              )
              .replace('› ', '\x1b[12X\x1b[1m›\x1b[0m ') +
            '\x1b[' +
            row +
            ';3H';
          let after = vt.replace('second number', 'second number updated');
          if (scenario === 'repainting moving prompt')
            after = vt
              .replace(
                later ? 'third number' : 'second number',
                later
                  ? 'third number\nfourth number'
                  : 'second number\nthird number',
              )
              .replace('[' + row + ';3H', '[' + (row + 1) + ';3H');
          if (scenario === 'repainting draft')
            after = after.replace('›\x1b[0m ', '›\x1b[0m draft');
          if (scenario === 'repainting cursor')
            after = after.replace(';3H', ';4H');
          if (scenario === 'repainting footer')
            after = after.replace('low · project', 'high · project');
          // The composer can move between consecutive native snapshots. No
          // independent plain-text read can be paired with a live cursor.
          const content = later ? after : vt;
          return stableViewport(
            target,
            async () => ({ content }),
            async () => {
              throw Error('separate screen read while streaming');
            },
            frameIdentity,
            atomicComposer,
          );
        }
        return {
          text: lines.join('\n'),
          cursor: { row: lines.indexOf('') + 2, column: 3 },
          hash: String(frames),
        };
      },
      run: async (args) => inputs.push(args.at(-1)),
    };
    const press = performRexKeyboard(bridge, {
      scope: 'rex',
      action: 'interrupt',
      target,
    });
    if (
      [
        'growing',
        'scrolled',
        'pinned header',
        'chunk delay',
        'repainting moving prompt',
        'repainting output',
      ].includes(scenario)
    )
      await press;
    else await assert.rejects(press);
    assert.deepEqual(
      inputs,
      [
        'growing',
        'scrolled',
        'pinned header',
        'chunk delay',
        'repainting moving prompt',
        'repainting output',
      ].includes(scenario)
        ? ['escape']
        : [],
      scenario,
    );
  }
});

test('Rex working status and the same busy Claude session allow one streaming Interrupt', async () => {
  const border = '─'.repeat(60);
  const footer = '⏵⏵ auto mode on (shift+tab to cycle)';
  const text = [
    'streamed output',
    border,
    '❯ ',
    border,
    'Opus 5.5 | project | main | ctx 5%',
    footer,
  ].join('\n');
  const target = {
    app: 'claude-code',
    session: 's',
    window: 'w',
    block: 'a',
    pid: 44,
    cwd: '/fixture',
    state: 'working',
    statusAt: 'now',
    rexSettings: { process: 'busy-1' },
  };
  for (const scenario of [
    'streaming',
    'spinner disappears',
    'draft',
    'approval',
    'done',
    'replacement',
    'focus',
  ]) {
    const inputs = [];
    let checks = 0;
    const streamingFrames = [
      text.replace('streamed output', '✻ Thinking…'),
      text.replace('streamed output', 'first line\nsecond line'),
    ];
    const bridge = {
      config: {
        backend: 'rex',
        allowClipboardFocus: true,
        claude: { enabled: true },
      },
      claude: { submissions: new Map() },
      assertDeliveryVisible() {},
      focused: async () =>
        scenario === 'focus' && checks ? { ...target, block: 'other' } : target,
      agent: async () =>
        scenario === 'done' ? { ...target, state: 'done' } : target,
      inspectClaudeKeyboard: async () =>
        ++checks > 1 && scenario === 'replacement' ? 'busy-2' : 'busy-1',
      readKeyboardText: async () => {
        if (scenario === 'spinner disappears') return streamingFrames.shift();
        if (scenario === 'draft') return text.replace('❯ ', '❯ unfinished');
        if (scenario === 'approval') return text + '\nEnter to confirm';
        return text;
      },
      run: async (args) => inputs.push(args.at(-1)),
    };
    const press = () =>
      performRexKeyboard(bridge, { scope: 'rex', action: 'interrupt', target });
    const shouldInterrupt =
      scenario === 'streaming' || scenario === 'spinner disappears';
    if (shouldInterrupt) {
      await press();
      if (scenario === 'spinner disappears')
        assert.equal(streamingFrames.length, 0);
      await assert.rejects(press, /already requested/);
    } else await assert.rejects(press);
    assert.deepEqual(inputs, shouldInterrupt ? ['escape'] : [], scenario);
  }
});

test('first reasoning picker can identify a single highlighted default when current is omitted', async () => {
  for (const duplicate of [false, true]) {
    const { screen, port } = fixture();
    const key = async (before, value) => {
      const view = await port.key(before, value);
      if (screen.surface === 'levels') {
        view.text = view.text.replace('(current)', '(default)');
        if (duplicate)
          view.text = view.text.replace('1. Low', '1. Low (default)');
      }
      return view;
    };
    const cycle = cycleCodexSetting({ ...port, key }, 'effort');
    if (duplicate) await assert.rejects(cycle, /Current setting unclear/);
    else {
      await cycle;
      assert.equal(screen.effort, 2);
    }
  }
});

test('Claude model notice and effort badge share only the reserved empty-composer row', () => {
  const {
    idleEffortIdentity,
  } = require('../../src/agents/claude/effort-slider');
  const frame = (notice, draft = '', history = 'history') => {
    const text = [
      history,
      notice,
      '─'.repeat(20),
      '❯ ' + draft,
      '─'.repeat(20),
      '',
    ].join('\n');
    const vt = text + '\x1b[4;3H';
    return idleEffortIdentity(vt, text);
  };
  const before = frame(
    'Model set to sonnet (claude-sonnet-5-5) for this session only',
  );
  assert.equal(before, frame('● high · /effort'));
  assert.notEqual(before, frame('● high · /effort', 'typed'));
  assert.notEqual(before, frame('● high · /effort', '', 'different history'));
  assert.notEqual(before, frame('another notice'));
});
