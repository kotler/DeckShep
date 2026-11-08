const { test } = require('node:test');
test('inspector', () => {
  'use strict';
  const fs = require('node:fs'),
    vm = require('node:vm'),
    path = require('node:path'),
    assert = require('node:assert/strict');
  const P = require('../../src/app/preferences'),
    defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');
  const nodes = new Map(),
    frames = [];
  let receive;
  const socket = {
    onopen() {},
    onmessage(raw) {
      receive(JSON.parse(raw.data));
    },
  };
  const client = {
    message: {
      subscribe(callback) {
        receive = callback;
      },
    },
    send(event, payload) {
      frames.push({ event, payload, context: 'runtime-action-context' });
      return Promise.resolve();
    },
  };
  function node(id) {
    if (!nodes.has(id))
      nodes.set(id, {
        value: '',
        checked: false,
        disabled: false,
        options: [],
        handlers: {},
        add(value) {
          this.options.push(value);
        },
        addEventListener(name, handler) {
          this.handlers[name] = handler;
        },
      });
    return nodes.get(id);
  }
  const context = {
    require: () => require('../../src/schemas'),
    window: { SDPIComponents: { streamDeckClient: client } },
    document: { getElementById: node, activeElement: null },

    Option: class {
      constructor(label, value) {
        this.label = label;
        this.value = value;
      }
    },
    RexPreferences: P,
    setInterval: () => {},
  };
  vm.createContext(context);
  vm.runInContext(
    require('typescript').transpileModule(
      fs
        .readFileSync(
          path.join(__dirname, '../../src/inspector/index.ts'),
          'utf8',
        )
        .replace(/export \{\};?/, ''),
      { compilerOptions: { target: 9, module: 0 } },
    ).outputText,
    context,
    {
      filename: path.join(__dirname, '../../src/inspector/index.ts'),
    },
  );
  context.window.connectElgatoStreamDeckSocket(
    '123',
    'runtime-action-context',
    'registerPropertyInspector',
    '{}',
    JSON.stringify({
      context: 'profile-action-id',
      payload: { settings: { profileScope: 'herdr', custom: 'preserved' } },
    }),
  );
  socket.onopen();
  assert.equal(frames.at(-1).event, 'sendToPlugin');
  assert.equal(
    frames.at(-1).context,
    'runtime-action-context',
    'Stream Deck requires its registration context, not actionInfo.context',
  );
  socket.onmessage({
    data: JSON.stringify({
      event: 'sendToPropertyInspector',
      payload: {
        kind: 'status',
        preferences: P.view(defaults),
        offline: false,
        agents: 2,
        codex: 2,
        metadata: 2,
        selected: { app: 'codex', state: 'idle' },
        setupBusy: false,
      },
    }),
  });
  assert(node('connection').textContent.includes('2/2'));
  assert.equal(node('allowClipboardFocus').disabled, false);
  assert.equal(node('setup').disabled, true);
  node('animationEnabled').checked = false;
  node('animationEnabled').handlers.change();
  assert.equal(frames.at(-1).event, 'sendToPlugin');
  assert.equal(frames.at(-1).payload.preferences.animationEnabled, false);
  assert.equal(frames.at(-1).context, 'runtime-action-context');
  node('action').value = 'zoom';
  node('action').handlers.change();
  assert.equal(frames.at(-1).context, 'runtime-action-context');
  assert.equal(frames.at(-1).event, 'setSettings');
  assert.equal(frames.at(-1).payload.profileScope, 'herdr');
  assert.equal(frames.at(-1).payload.custom, 'preserved');
  assert.equal(node('backend').disabled, true);
  socket.onmessage({
    data: JSON.stringify({
      event: 'sendToPropertyInspector',
      payload: {
        kind: 'status',
        backend: 'herdr',
        preferences: P.view({
          ...defaults,
          backend: 'herdr',
          herdr: { socketPath: '/tmp/named-session.sock' },
        }),
        offline: false,
        agents: 2,
        codex: 2,
        metadata: 2,
        selected: { app: 'codex', state: 'idle' },
        setupBusy: false,
      },
    }),
  });
  assert.equal(node('herdrConnection').hidden, false);
  assert.equal(node('rexSetup').hidden, true);
  assert.equal(node('allowClipboardFocus').disabled, true);
  assert.equal(node('setup').disabled, true);
  assert.equal(node('backend').value, 'herdr');
  assert.equal(node('herdrSocketPath').value, '/tmp/named-session.sock');
  assert.equal(node('herdrTitleIdentity').checked, false);
  assert.equal(node('herdrTitleIdentity').disabled, false);
  node('herdrTitleIdentity').checked = true;
  node('herdrTitleIdentity').handlers.change();
  assert.equal(frames.at(-1).payload.preferences.herdrTitleIdentity, true);
  console.log(
    'PASS inspector registration context, status connection, explicit setup consent, shared preferences and action overrides',
  );
});
