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
