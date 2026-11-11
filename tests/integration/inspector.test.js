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
  const timers = new Map();
  let timerId = 0;
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
        scrollIntoView() {
          this.scrolledIntoView = true;
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
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
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
  assert(!node('action').options.some((option) => option.value === 'zoom'));
  node('action').value = 'effort';
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
        backend: 'rex',
        preferences: P.view({ ...defaults, allowClipboardFocus: true }),
        offline: false,
        agents: 1,
        codex: 1,
        metadata: 0,
        selected: { app: 'codex', state: 'idle' },
        setupBusy: false,
      },
    }),
  });
  assert.equal(node('setup').disabled, false);
  node('setup').handlers.click();
  assert.equal(frames.at(-1).payload.kind, 'setupFooter');
  assert.equal(node('message').scrolledIntoView, true);
  assert.equal(
    node('message').textContent,
    'Checking the selected Codex identity…',
  );
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
  const codec =
    require('../../src/app/experimental-preferences').preferenceCodec(true);
  const appConfig = codec.profileConfig(defaults, codec.store(), 'herdr-app');
  socket.onmessage({
    data: JSON.stringify({
      event: 'sendToPropertyInspector',
      payload: {
        kind: 'status',
        backend: 'herdr-app',
        profileName: 'Herdr App',
        preferences: codec.view(appConfig),
        offline: true,
        agents: 0,
        setupBusy: false,
        verifiedFocus: false,
      },
    }),
  });
  assert.equal(node('herdrAppSetup').hidden, false);
  assert.equal(node('providerSetup').hidden, true);
  assert.equal(node('promptShortcuts').hidden, true);
  assert.equal(node('herdrSessionChoices').hidden, true);
  assert.equal(node('rexSetup').hidden, true);
  assert.equal(node('claudeEnabled').disabled, true);
  assert.equal(node('herdrAppFocusRequestEnabled').checked, false);
  assert(node('selection').textContent.includes('do not verify'));
  assert(!node('action').options.some((option) => option.value === 'zoom'));
  assert(
    !node('action').options.find((option) => option.value === 'next').disabled,
  );
  node('herdrAppHome').value = '/sample/app';
  node('herdrAppHome').handlers.change();
  assert.equal(frames.at(-1).payload.preferences.herdrAppHome, '/sample/app');
  node('herdrAppFocusRequestEnabled').checked = true;
  node('herdrAppFocusRequestEnabled').handlers.change();
  assert.deepEqual(Object.keys(frames.at(-1).payload.preferences), [
    'herdrAppFocusRequestEnabled',
  ]);
  assert.equal(
    frames.at(-1).payload.preferences.herdrAppFocusRequestEnabled,
    true,
  );
  const count = frames.length;
  node('herdrAppHome').value = 'relative';
  node('herdrAppHome').handlers.change();
  assert.equal(frames.length, count);
  socket.onmessage({
    data: JSON.stringify({
      event: 'sendToPropertyInspector',
      payload: {
        kind: 'doctor',
        checks: [{ ok: false, reason: 'No App build approved' }],
        sessions: [],
      },
    }),
  });
  assert(node('checklist').textContent.includes('No App build approved'));
  const sent = frames.length;
  node('refresh').handlers.click();
  assert.equal(node('message').textContent, 'Refreshing status…');
  assert.deepEqual(
    frames.slice(sent).map((frame) => frame.payload.kind),
    ['refresh', 'doctor'],
  );
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.match(node('message').textContent, /No plugin response/);
  socket.onmessage({
    data: JSON.stringify({
      event: 'sendToPropertyInspector',
      payload: {
        kind: 'status',
        profileScope: 'herdr-app',
        profileName: 'Herdr App',
        backend: 'herdr-app',
        preferences: { ...P.view(defaults), herdrAppHome: '/sample/app' },
        offline: false,
        agents: 2,
        selected: null,
        setupBusy: false,
        message: 'App status refreshed',
      },
    }),
  });
  assert.equal(node('message').textContent, 'App status refreshed');
  assert.equal(timers.size, 0);
  console.log(
    'PASS inspector registration context, status connection, explicit setup consent, shared preferences and action overrides',
  );
});
