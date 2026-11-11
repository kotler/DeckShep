const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Bridge } = require('../../src/app/session');
const { snapshot } = require('../../src/guards/context');
const defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');
const { BackgroundControls } = require('../../src/agents/codex/background');
const chatId = '01a1ae31-d050-7503-afec-fd2b40d2bc26';

// All client/process facts and visible-pane queries are synthetic. Keep the
// real Bridge discovery, focused(), withContext() and final input checks.
async function fixture() {
  const state = {
    client: 'client:old',
    online: true,
    ambiguous: false,
    focused: 'a',
    pid: 42,
    programState: 'blocked',
    stamp: new Date(Date.now() - 1000).toISOString(),
    onVisible: null,
    onWrite: null,
  };
  const calls = [],
    visibleClients = [];
  const bridge = new Bridge(
    {
      ...structuredClone(defaults),
      allowClipboardFocus: true,
      bringToFront: false,
    },
    async (args) => {
      calls.push(args);
      if (args[0] === 'client') {
        const client = (id) => ({
          client_id: id,
          info: { kind: 'app', platform: 'macos', name: 'Rex Beta' },
          connection_state: 'connected',
        });
        return {
          clients: !state.online
            ? []
            : state.ambiguous
              ? [client('client:old'), client('client:new')]
              : [client(state.client)],
        };
      }
      if (args[0] === 'ls')
        return { sessions: [{ session_id: 's', label: 'Retained title' }] };
      if (args[0] === 'session')
        return {
          windows: [
            {
              window_id: 'w',
              // Server focus deliberately disagrees with the visible app.
              focused_block_id: 'a',
              layers: [
                {
                  blocks: ['a', 'b'].map((block_id) => ({
                    block_id,
                    creator_name: 'com.superlogical.terminal',
                  })),
                },
              ],
            },
          ],
        };
      if (args[0] === 'block') {
        const pid = args[5] === 'a' ? state.pid : 43;
        if (args[6] === 'process')
          return {
            foreground: {
              pid,
              user_id: process.getuid(),
              name: 'codex',
              path: '/fixture/codex',
              cwd: '/fixture/project',
            },
          };
        if (args[6] === 'program_status')
          return {
            records: [
              {
                app: 'codex',
                state: state.programState,
                kind: 'question',
                updated_at: state.stamp,
                owner: { pid, name: 'codex' },
              },
            ],
          };
        if (args[6] === 'size') return { rows: 6, cols: 120 };
        if (args[6] === 'format')
          return {
            content:
              JSON.parse(args[7]).format === 'vt'
                ? 'fixture viewport\x1b[2;3H'
                : `Fixture\n› prompt\n\n  ${chatId} · GPT-6.1-Sol high\n  ? for shortcuts\n`,
          };
      }
      if (args[0] === 'send-key') {
        await state.onWrite?.();
        return null;
      }
      throw Error('Unexpected fixture operation');
    },
    async () => {
      throw Error('Activation is not part of this fixture');
    },
    async (client) => {
      visibleClients.push(client);
      const pane = state.focused;
      await state.onVisible?.(visibleClients.length);
      return pane;
    },
  );
  const agents = await bridge.discover();
  const target = snapshot(agents[0]);
  const press = () =>
    bridge.withContext({ target, action: 'up', verifyChat: false }, () =>
      bridge.questionKey('up'),
    );
  const writes = () => calls.filter((args) => args[0] === 'send-key');
  calls.length = 0;
  return { bridge, state, target, press, writes, visibleClients };
}

test('Rex relaunch preserves stable slots but freshly verifies the replacement app before one input', async () => {
  const f = await fixture(),
    slots = structuredClone(f.bridge.slots);
  f.state.online = false;
  await assert.rejects(f.press, /offline/);
  assert.deepEqual(f.writes(), []);
  f.state.online = true;
  f.state.client = 'client:new';
  await f.bridge.discover();
  assert.deepEqual(f.bridge.slots, slots);
  await f.press();
  assert.deepEqual(f.writes(), [['send-key', '-s', 's', '-b', 'a', 'up']]);
  assert(f.visibleClients.length >= 2);
  assert(f.visibleClients.every((client) => client === 'client:new'));
});

for (const [name, change] of [
  [
    'another visible pane with retained titles',
    (f) => {
      f.state.client = 'client:new';
      f.state.focused = 'b';
    },
  ],
  [
    'a replacement process in the same pane',
    (f) => {
      f.state.client = 'client:new';
      f.state.pid = 99;
    },
  ],
  [
    'a changed native waiting request',
    (f) => {
      f.state.stamp = new Date(Date.parse(f.state.stamp) + 1).toISOString();
    },
  ],
  [
    'overlapping old and new app clients',
    (f) => {
      f.state.ambiguous = true;
    },
  ],
]) {
  test(`Rex reconnect refuses ${name} without input`, async () => {
    const f = await fixture();
    change(f);
    await assert.rejects(f.press);
    assert.deepEqual(f.writes(), []);
  });
}

test('a relaunch during verification cannot redirect the captured key to a new pane', async () => {
  const f = await fixture();
  f.state.onVisible = (reads) => {
    if (reads === 2) {
      f.state.client = 'client:new';
      f.state.focused = 'b';
    }
  };
  await assert.rejects(f.press, /Reselect/);
  assert.deepEqual(f.writes(), []);
  assert.equal(f.visibleClients.at(-1), 'client:new');
  assert.equal(f.bridge.lastTarget, null);
  assert.equal(f.bridge.selectionNotice, true);
});

test('an uncertain input failure during relaunch never retries or compensates', async () => {
  const f = await fixture();
  f.state.onWrite = () => {
    f.state.client = 'client:new';
    throw Error('Uncertain fixture write');
  };
  await assert.rejects(f.press, /Uncertain/);
  assert.deepEqual(f.writes(), [['send-key', '-s', 's', '-b', 'a', 'up']]);
  assert.equal(f.bridge.actionContext, null);
});

test('real Rex context refuses every Codex control without a session binding', async () => {
  const f = await fixture();
  f.state.programState = 'working';
  const target = snapshot((await f.bridge.discover())[0]);
  for (const action of [
    'model',
    'effort',
    'permissions',
    'plan',
    'interrupt',
  ]) {
    await assert.rejects(
      () =>
        f.bridge.withContext({ target, action, verifyChat: true }, () => {
          assert.fail('An unbound control must never reach provider dispatch');
        }),
      /Chat metadata loading/,
    );
  }
  assert.deepEqual(f.writes(), []);
});

test('real Rex Interrupt verifies footer and active turn before sending one Escape', async () => {
  const f = await fixture(),
    requests = [];
  f.state.programState = 'working';
  const target = {
    ...snapshot((await f.bridge.discover())[0]),
    chatId,
    runId: 'turn-1',
  };
  const controls = new BackgroundControls(f.bridge, {
    socketFor: async () => ({ socket: '/fixture/daemon.sock' }),
    connect: async () => ({
      request: async (method, params) => {
        requests.push({ method, params });
        if (method === 'thread/read')
          return {
            thread: {
              id: chatId,
              cwd: '/fixture/project',
              status: { type: 'active', activeFlags: [] },
            },
          };
        if (method === 'thread/turns/list')
          return {
            data: [
              {
                id: 'turn-1',
                status: 'inProgress',
                items: [],
                itemsView: 'notLoaded',
              },
            ],
          };
        throw Error('Unexpected fixture daemon request');
      },
      close() {},
    }),
  });
  f.bridge.verifyRunning = (agent) => controls.running(agent);
  await f.bridge.withContext(
    { target, action: 'interrupt', verifyChat: true },
    () => f.bridge.interrupt(),
  );
  assert.deepEqual(f.writes(), [['send-key', '-s', 's', '-b', 'a', 'escape']]);
  assert.deepEqual(
    requests.map(({ method }) => method),
    ['thread/read', 'thread/turns/list'],
  );
  assert(f.visibleClients.length >= 3);
});
