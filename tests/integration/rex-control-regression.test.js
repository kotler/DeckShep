const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { harness } = require('../helpers/plugin-harness');
const { KeyboardScreen } = require('../helpers/keyboard-screen');
const { ClaudeKeyboardScreen } = require('../helpers/claude-keyboard-screen');
const { BackgroundControls } = require('../../src/agents/codex/background');
const defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');

class ClaudeScreen extends ClaudeKeyboardScreen {
  modes = ['default mode', 'accept edits', 'plan mode'];
  mode = 0;
  send(key) {
    if (key === 'shift+tab' && !this.open && !this.slider && !this.command) {
      this.mode = (this.mode + 1) % this.modes.length;
      this.plan = this.mode === 2;
    } else super.send(key);
  }
  view() {
    const view = super.view();
    if (!this.open && !this.slider && !this.command) {
      view.text += '\n⏵⏵ ' + this.modes[this.mode] + ' on (shift+tab to cycle)';
      view.hash = createHash('sha256').update(view.text).digest('hex');
    }
    return view;
  }
}

async function fixture(count = 2, { mixed = false, bound = false } = {}) {
  let metadataGate;
  const h = harness({
    fs: {
      readFileSync: () =>
        JSON.stringify({
          ...defaults,
          allowClipboardFocus: true,
          claude: { ...defaults.claude, enabled: true },
        }),
    },
    metadataFactory: () => ({
      hydrate() {},
      async refresh(agents) {
        if (metadataGate) {
          metadataGate.started.resolve();
          await metadataGate.done.promise;
        }
        return agents;
      },
    }),
  });
  h.setLive(h.live.slice(0, count));
  const screens = new Map(
    h.live.map((agent, index) => [
      agent.block,
      mixed && index === 1 ? new ClaudeScreen() : new KeyboardScreen(),
    ]),
  );
  for (const screen of screens.values())
    if (screen instanceof KeyboardScreen) {
      screen.showShortcutRow = true;
      screen.modeOnShortcutRow = true;
    }
  for (const [index, agent] of h.live.entries()) {
    if (mixed && index === 1) {
      agent.app = 'claude-code';
      agent.name = 'claude';
    }
    agent.chatId = bound ? agent.chatId : null;
    agent.rexSettings = {};
  }
  const b = h.api.bridge;
  b.inspectKeyboardProcess = async (pid) => ({
    pid,
    codex: true,
    image: 'fixture',
    startedAt: '1',
  });
  b.inspectClaudeKeyboard = async (agent) => 'fixture-process-' + agent.pid;
  b.agent = async (target) => {
    const agent = h.live.find((item) => item.block === target.block);
    return agent && { ...agent };
  };
  b.readKeyboardView = async (agent) => screens.get(agent.block).view();
  b.readKeyboardText = async (agent) => screens.get(agent.block).view().text;
  const original = b.run.bind(b);
  b.run = (args, input, target) => {
    if (!['send', 'send-key'].includes(args[0]))
      return original(args, input, target);
    target ||= b.actionContext?.target || b.lastTarget;
    return b.delivery.run(
      args,
      input,
      async (beforeIO) => {
        beforeIO();
        const key = input ? input.slice(6, -6) : args.at(-1);
        screens.get(target.block).send(key);
        h.calls.push({ block: target.block, key });
      },
      target,
    );
  };
  h.api.keys.clear();
  await h.appear('rex');
  await new Promise(setImmediate);
  h.tick(500);
  return {
    h,
    b,
    screens,
    face(row, column) {
      const image = Buffer.from(
        h.api.keys.get('rex:' + row + ',' + column).lastImage.split(',')[1],
        'base64',
      ).toString();
      return Array.from(
        image.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g),
        (match) => match[1],
      );
    },
    press(column) {
      return h.profilePress('rex', 2, column);
    },
    async select(block) {
      h.tick(500);
      await h.profilePress(
        'rex',
        0,
        h.live.findIndex((agent) => agent.block === block),
      );
      await new Promise(setImmediate);
      h.tick(500);
      assert.equal(b.lastTarget.block, block);
    },
    pauseMetadata() {
      metadataGate = {
        started: Promise.withResolvers(),
        done: Promise.withResolvers(),
      };
      return metadataGate;
    },
  };
}

test('a Codex setting updates its face and releases the press while optional metadata is pending', async () => {
  const f = await fixture(1);
  const paused = f.pauseMetadata();
  let finished = false;
  const press = f.press(1).then(() => {
    finished = true;
  });
  try {
    await paused.started.promise;
    await new Promise(setImmediate);
    assert.equal(f.screens.get('a').effort, 2);
    assert.deepEqual(f.face(2, 1), ['Effort', 'xhigh']);
    assert.equal(
      finished,
      true,
      'optional metadata must not hold the key queue',
    );
    for (const column of [0, 2, 3]) {
      f.h.tick(2500);
      await f.press(column);
      assert(!f.h.socket.frames.some((frame) => frame.event === 'showAlert'));
    }
    f.h.change('a', { state: 'working', statusAt: 'next-turn' });
    f.screens.get('a').surface = 'working';
    await f.h.api.refresh();
    await new Promise(setImmediate);
    f.h.tick(500);
    const before = f.h.calls.length;
    await f.press(4);
    assert.deepEqual(f.h.calls.slice(before), [{ block: 'a', key: 'escape' }]);
  } finally {
    paused.done.resolve();
    await press;
  }
});

test('switching Codex agents and back cycles every offered setting without alerts', async () => {
  const f = await fixture();
  for (const selected of ['a', 'b', 'a']) {
    await f.select(selected);
    const screen = f.screens.get(selected);
    const other = f.screens.get(selected === 'a' ? 'b' : 'a');
    const untouched = [
      other.model,
      other.effort,
      other.permissions,
      other.plan,
    ];
    for (const column of [0, 1, 2, 3]) {
      const start = [
        screen.model,
        screen.effort,
        screen.permissions,
        screen.plan,
      ][column];
      const offered =
        column === 0
          ? screen.models.length
          : column === 1
            ? screen.levels.length
            : column === 2
              ? screen.profiles.length - 1
              : 2;
      const seen = new Set([start]);
      for (let step = 0; step < offered; step++) {
        f.h.tick(500);
        await f.press(column);
        seen.add(
          [screen.model, screen.effort, screen.permissions, screen.plan][
            column
          ],
        );
      }
      assert.equal(seen.size, offered);
      assert.equal(
        [screen.model, screen.effort, screen.permissions, screen.plan][column],
        start,
      );
    }
    assert.deepEqual(
      [other.model, other.effort, other.permissions, other.plan],
      untouched,
    );
  }
  assert.deepEqual(
    f.h.socket.frames.filter((frame) => frame.event === 'showAlert'),
    [],
  );
});

test('Interrupt sends one Escape to the focused working Codex agent after switching away and back', async () => {
  const f = await fixture();
  for (const selected of ['a', 'b', 'a']) {
    await f.select(selected);
    f.h.change(selected, { state: 'working', statusAt: 'run-' + f.h.tick(0) });
    f.screens.get(selected).surface = 'working';
    await f.h.api.refresh();
    await new Promise(setImmediate);
    f.h.tick(500);
    const before = f.h.calls.length;
    await f.press(4);
    assert.equal(f.screens.get(selected).surface, 'idle');
    assert.deepEqual(f.h.calls.slice(before), [
      { block: selected, key: 'escape' },
    ]);
    f.h.change(selected, { state: 'idle' });
  }
  assert.deepEqual(
    f.h.socket.frames.filter((frame) => frame.event === 'showAlert'),
    [],
  );
});

test('switching Codex to Claude and back cycles all settings and confirms each displayed value', async () => {
  const f = await fixture(2, { mixed: true });
  for (const selected of ['a', 'b', 'a', 'b']) {
    await f.select(selected);
    const screen = f.screens.get(selected);
    const claude = screen instanceof ClaudeScreen;
    const value = (column) =>
      [
        screen.model,
        screen.effort,
        claude ? screen.mode : screen.permissions,
        claude ? screen.mode : screen.plan,
      ][column];
    const caption = (column) =>
      [
        screen.models[screen.model],
        screen.levels[screen.effort],
        claude
          ? screen.modes[screen.mode]
          : screen.profiles[screen.permissions],
        claude ? screen.modes[screen.mode] : screen.plan ? 'Plan' : 'Default',
      ][column];
    for (const column of claude ? [0, 1, 2] : [0, 1, 2, 3]) {
      const offered =
        column === 0
          ? screen.models.length
          : column === 1
            ? screen.levels.length
            : claude
              ? screen.modes.length
              : column === 2
                ? screen.profiles.length - 1
                : 2;
      const start = value(column),
        seen = new Set([start]);
      for (let step = 0; step < offered; step++) {
        f.h.tick(500);
        await f.press(column);
        seen.add(value(column));
        const shown = f
          .face(2, column)
          .slice(1)
          .join(' ')
          .replace(/\?$/, '')
          .toLowerCase();
        const expected =
          column === 3 && !claude && !screen.plan
            ? ''
            : caption(column).toLowerCase().replace('extra high', 'xhigh');
        assert.equal(shown, expected, selected + ' column ' + column);
      }
      assert.equal(seen.size, offered);
      assert.equal(value(column), start);
    }
  }
  assert.deepEqual(
    f.h.socket.frames.filter((frame) => frame.event === 'showAlert'),
    [],
  );
});

test('bound Codex Interrupt verifies the selected chat and active turn after switching agents', async () => {
  const f = await fixture(2, { bound: true });
  const reads = [];
  f.b.codexIdentity = async (_bridge, agent) => agent.chatId;
  f.b.verifyRunning = (agent) =>
    new BackgroundControls(f.b, {
      socketFor: async (pid) => ({ pid, socket: '/fixture/owned-' + pid }),
      footer: f.b.codexIdentity,
      connect: async () => ({
        close() {},
        async request(method, params) {
          reads.push({ method, params });
          if (method === 'thread/read')
            return {
              thread: {
                id: agent.chatId,
                cwd: agent.cwd,
                status: { type: 'active', activeFlags: [] },
              },
            };
          if (method === 'thread/turns/list')
            return {
              data: [
                {
                  id: agent.runId,
                  status: 'inProgress',
                  itemsView: 'notLoaded',
                  items: [],
                },
              ],
            };
          assert.fail('Unexpected daemon mutation');
        },
      }),
    }).running(agent);
  for (const selected of ['a', 'b', 'a']) {
    await f.select(selected);
    f.h.change(selected, {
      state: 'working',
      runId: 'turn-' + selected,
      statusAt: 'working-' + f.h.tick(0),
    });
    f.screens.get(selected).surface = 'working';
    await f.h.api.refresh();
    await new Promise(setImmediate);
    f.h.tick(500);
    const before = f.h.calls.length;
    await f.press(4);
    assert.deepEqual(
      f.h.calls.slice(before),
      [{ block: selected, key: 'escape' }],
      JSON.stringify(f.h.api.keys.get('rex:2,4').feedback),
    );
    assert.equal(f.screens.get(selected).surface, 'idle');
    f.h.change(selected, { state: 'idle', runId: null });
  }
  assert.equal(
    reads.filter((item) => item.method === 'thread/turns/list').length,
    3,
  );
  assert.deepEqual(
    f.h.socket.frames.filter((frame) => frame.event === 'showAlert'),
    [],
  );
});
