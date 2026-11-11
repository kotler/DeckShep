'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Bridge } = require('../../src/app/session');
const { createApplication } = require('../../src/app/controller');
const { BackgroundControls } = require('../../src/agents/codex/background');
const defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');

function fixture() {
  const calls = [];
  let visible = 'a';
  const panes = new Map(
    ['a', 'b', 'c', 'd', 'e', 'f'].map((block, index) => [
      block,
      { pid: 42 + index, name: index % 2 ? 'claude' : 'codex', state: 'idle' },
    ]),
  );
  const config = {
    ...structuredClone(defaults),
    allowClipboardFocus: true,
    bringToFront: false,
    claude: { ...defaults.claude, enabled: true },
  };
  const bridge = new Bridge(
    config,
    async (args) => {
      calls.push(args);
      if (args[0] === 'client')
        return {
          clients: [
            {
              client_id: 'client',
              connection_state: 'connected',
              info: { kind: 'app', platform: 'macos', name: 'Rex Beta' },
            },
          ],
        };
      if (args[0] === 'ls')
        return { sessions: [{ session_id: 's', label: 'Workspace' }] };
      if (args[0] === 'session')
        return {
          windows: [
            {
              window_id: 'w',
              layers: [
                {
                  blocks: [...panes.keys()].map((block_id) => ({
                    block_id,
                    creator_name: 'com.superlogical.terminal',
                  })),
                },
              ],
            },
          ],
        };
      if (args[0] === 'block') {
        const pane = panes.get(args[5]);
        if (!pane) throw Error('Panel closed');
        if (args[6] === 'process')
          return {
            foreground: {
              ...pane,
              user_id: process.getuid(),
              path: '/fixture/' + pane.name,
              cwd: '/fixture/project',
            },
          };
        if (args[6] === 'title') return { title: 'Rex ' + args[5] };
        if (args[6] === 'program_status')
          return {
            records: [
              {
                app: pane.name === 'claude' ? 'claude-code' : 'codex',
                state: pane.state,
                updated_at: new Date().toISOString(),
                owner: { pid: pane.pid, name: pane.name },
              },
            ],
          };
      }
      if (args[0] === 'focus') {
        visible = args[3];
        return null;
      }
      if (args[0] === '-C' && args[3] === 'session.select') return null;
      throw Error('Unexpected fixture transport');
    },
    async () => assert.fail('No activation in this fixture'),
    async () => visible,
    async () => {
      throw Error('Codex identity unavailable');
    },
  );
  bridge.claude.enrich = async () => {
    throw Error('Claude hooks unavailable');
  };
  bridge.verifyRunning = (agent) =>
    new BackgroundControls(bridge, {
      socketFor: async () => ({ socket: '/fixture/daemon.sock' }),
      footer: bridge.codexIdentity,
      connect: async () => ({
        request: async () => assert.fail('No identity; no daemon read'),
        close() {},
      }),
    }).running(agent);
  const writes = () =>
    calls.filter((args) =>
      ['focus', '-C', 'send', 'send-key'].includes(args[0]),
    );
  return {
    bridge,
    panes,
    config,
    calls,
    writes,
    setVisible: (block) => {
      visible = block;
    },
  };
}

test('Rex discovery, agent focus, Next and Collapse never call Claude or Codex integration paths', async () => {
  const f = fixture();
  let providerReads = 0;
  f.bridge.claude.enrich = async () => {
    providerReads++;
    throw Error('Unavailable');
  };
  await f.bridge.discover();
  assert.equal(f.bridge.agents.length, 6);
  assert.equal(f.bridge.navigationAgents[1].terminalTitle, 'Rex b');
  assert.equal(f.bridge.navigationAgents[1].state, 'idle');
  await f.bridge.focus(f.bridge.agents[1]);
  assert.equal(
    f.bridge.lastNavigationTarget,
    undefined,
    'focus acknowledgements are not observations',
  );
  await f.bridge.navigate(1);
  assert.equal(f.bridge.lastTarget.block, 'c');
  f.panes.delete('b');
  assert.equal((await f.bridge.collapse()).removed, 1);
  assert.equal(providerReads, 0);
  assert(!f.calls.some((args) => ['send', 'send-key'].includes(args[0])));
});

test('provider failure and delayed metadata cannot replace Rex labels/status or block rows one and two', async () => {
  const f = fixture();
  class Socket extends EventEmitter {
    readyState = 1;
    frames = [];
    send(raw) {
      this.frames.push(JSON.parse(raw));
    }
  }
  const socket = new Socket();
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const app = createApplication({
    socket,
    clock: () => 10000,
    setInterval: () => {},
    fs: { readFileSync: () => JSON.stringify(f.config) },
    backendFactory: () => f.bridge,
    metadataFactory: () => ({
      hydrate(agents) {
        for (const agent of agents)
          Object.assign(agent, {
            chatName: 'Provider title',
            project: 'Provider project',
            state: 'working',
            nativeIdentity: 'provider-identity',
            chatId: 'provider-chat',
            backgroundOnly: true,
          });
      },
      async refresh() {
        await pending;
        throw Error('Provider unavailable');
      },
    }),
  });
  const api = app.getController('rex');
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 5; column++)
      api.keys.set(`${row},${column}`, {
        settings: {},
        coordinates: { row, column },
      });
  f.setVisible('b');
  await api.initialize();
  const image = (key) =>
    Buffer.from(api.keys.get(key).lastImage.split(',')[1], 'base64').toString();
  assert(image('0,0').includes('Rex a'));
  assert(image('0,0').includes('Ready'));
  assert(!image('0,0').includes('Provider'));
  assert(
    image('0,1').includes('id="selected-agent"'),
    'startup focus is independent of failed Claude hooks',
  );
  await api.press('0,1');
  assert(image('0,1').includes('id="selected-agent"'));
  await api.press('1,0');
  assert.equal(f.bridge.lastNavigationTarget.block, 'c');
  await api.press('1,1');
  assert.equal(api.getBank(), 1);
  f.panes.delete('a');
  await api.refresh();
  await api.press('1,2');
  assert.equal(f.bridge.slots.length, 5);
  assert(!f.calls.some((args) => ['send', 'send-key'].includes(args[0])));
  assert(!socket.frames.some((frame) => frame.event === 'showAlert'));
  release();
  await new Promise(setImmediate);
  assert(!image('0,0').includes('Provider'));
});

test('provider-free navigation still rejects a replaced PID and row-three Codex actions still require identity', async () => {
  const f = fixture();
  await f.bridge.discover();
  const old = { ...f.bridge.agents[0] };
  f.panes.get('a').pid = 99;
  await assert.rejects(f.bridge.focus(old), /process changed/);
  assert.deepEqual(f.writes(), []);
  f.panes.get('a').state = 'working';
  await assert.rejects(f.bridge.interrupt(), /Codex identity unavailable/);
  assert.deepEqual(f.writes(), []);
});

test('a physical settings press during a slow poll sees the last complete frame and keeps its guard armed', async () => {
  const { KeyboardScreen } = require('../helpers/keyboard-screen'),
    screen = new KeyboardScreen(),
    f = fixture();
  class Socket extends EventEmitter {
    readyState = 1;
    frames = [];
    send(raw) {
      this.frames.push(JSON.parse(raw));
    }
  }
  const socket = new Socket();
  let now = 1000,
    failView = false;
  const b = f.bridge;
  b.inspectKeyboardProcess = async (pid) => ({
    pid,
    codex: true,
    image: 'fixture',
    startedAt: '1',
  });
  b.readKeyboardView = async () => {
    if (failView) throw Error('redraw');
    return screen.view();
  };
  // Use actual guarded delivery for keys; retain the owned fixture for Rex reads.
  const original = b.run.bind(b);
  b.run = (args, input, target) => {
    if (args[6] === 'modes')
      return Promise.resolve({ modes: [{ number: 2004, set: true }] });
    if (['send', 'send-key'].includes(args[0]))
      return b.delivery.run(
        args,
        input,
        async (beforeIO) => {
          beforeIO();
          screen.send(input ? input.slice(6, -6) : args.at(-1));
        },
        target,
      );
    return original(args, input, target);
  };
  const app = createApplication({
    socket,
    clock: () => now,
    setInterval: () => {},
    fs: { readFileSync: () => JSON.stringify(f.config) },
    backendFactory: () => b,
    metadataFactory: () => ({
      hydrate() {},
      async refresh(agents) {
        return agents;
      },
    }),
  });
  const api = app.getController('rex');
  api.keys.set('effort', { settings: {}, coordinates: { row: 2, column: 1 } });
  await api.refresh();
  await new Promise(setImmediate);
  now += 500;
  const key = api.keys.get('effort'),
    originalImage = key.lastImage,
    originalPress = key.presented;
  assert(
    Buffer.from(originalImage.split(',')[1], 'base64')
      .toString()
      .includes('high'),
  );
  const display = b.displayedAgent.bind(b);
  let started, finish;
  const reading = new Promise((resolve) => {
    started = resolve;
  });
  b.displayedAgent = async () => {
    started();
    await new Promise((resolve) => {
      finish = resolve;
    });
    return display();
  };
  const refresh = api.refresh();
  await reading;
  api.render();
  assert.equal(key.lastImage, originalImage);
  assert.equal(key.presented.stamp, originalPress.stamp);
  const press = api.press('effort', { ...key.presented, pressedAt: now });
  b.displayedAgent = display;
  finish();
  await refresh;
  await press;
  await new Promise(setImmediate);
  assert(!socket.frames.some((f) => f.event === 'showAlert'));
  assert.equal(screen.effort, 2);
  assert.equal(screen.model, 0);
  const success = key.lastImage;
  now += 2000;
  failView = true;
  await api.refresh();
  await new Promise(setImmediate);
  assert.equal(key.lastImage, success);
  assert(
    !key.presented.target.rexSettings.viewHash,
    'last caption cannot authorize input',
  );
  now += 5000;
  await api.refresh();
  await new Promise(setImmediate);
  const captions = Buffer.from(key.lastImage.split(',')[1], 'base64')
    .toString()
    .matchAll(/<text\b[^>]*>([^<]*)<\/text>/g);
  assert.deepEqual(
    Array.from(captions, (match) => match[1]),
    ['Effort', ''],
  );
  failView = false;
  await api.refresh();
  await new Promise(setImmediate);
  assert.equal(key.lastImage, success);
});
