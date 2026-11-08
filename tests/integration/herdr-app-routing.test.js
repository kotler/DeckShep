const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');
const { HerdrAppPreview } = require('../../src/app/herdr-app-preview');
const { DeliveryKernel } = require('../../src/app/delivery');
const { GuardPipeline } = require('../../src/guards/pipeline');
const { GuardedBackend } = require('../../src/terminals/contract/backend');
const { backendCapabilities } = require('../../src/domain/capabilities');

test('App owns routed key contexts and settings without using legacy discovery, metadata or setup', async () => {
  let setupCalls = 0;
  const forbidden = () => {
    setupCalls++;
    throw Error('unreachable');
  };
  const h = harness({
    experimentalHerdrApp: true,
    diagnostics: forbidden,
    herdrSessions: forbidden,
    setupCodex: forbidden,
    integrationSetup: { preview: forbidden, apply: forbidden, undo: forbidden },
  });
  await h.appear('herdr-app');
  const app = h.controller('herdr-app');
  assert(app.bridge instanceof HerdrAppPreview);
  assert.equal(app.keys.size, 15);
  assert.equal(app.bridge.config.backend, 'herdr-app');
  assert.equal(app.bridge.delivery.backend.id, 'herdr-app');
  assert.equal(app.bridge.delivery.backend.verifiedControls.size, 0);
  const before = app.bridge;
  const context = 'herdr-app:0,0';
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'sendToPlugin',
      context,
      payload: {
        kind: 'preferences',
        preferences: {
          herdrAppHome: '/sample/app',
          herdrAppCoreSocketPath: '/sample/core.sock',
          herdrAppReadbackEnabled: true,
          herdrAppInputEnabled: true,
          claudeEnabled: true,
        },
      },
    }),
  );
  await app.settled();
  assert.notEqual(app.bridge, before);
  assert.equal(app.bridge.config.herdrApp.inputEnabled, true);
  assert.equal(h.api.bridge.config.claude.enabled, false);
  for (const kind of [
    'doctor',
    'claudePreview',
    'claudeApply',
    'claudeUndo',
    'removeIntegrations',
    'setupFooter',
    'status',
  ]) {
    h.socket.emit(
      'message',
      JSON.stringify({ event: 'sendToPlugin', context, payload: { kind } }),
    );
    await app.settled();
  }
  const status = h.socket.frames
    .filter((frame) => frame.event === 'sendToPropertyInspector')
    .at(-1).payload;
  assert.equal(status.profileName, 'Herdr App');
  assert.equal(status.profileScope, 'herdr-app');
  assert.equal(status.preferences.herdrAppReadbackEnabled, true);
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 5; column++)
      await h.profilePress('herdr-app', row, column);
  assert.equal(h.calls.length, 0);
  assert.equal(setupCalls, 0);
  assert(
    h.socket.frames
      .filter(
        (frame) =>
          frame.event === 'setImage' && frame.context.startsWith('herdr-app:'),
      )
      .every((frame) =>
        Buffer.from(frame.payload.image.split(',')[1], 'base64')
          .toString()
          .includes('Preview only'),
      ),
  );
  await assert.rejects(app.bridge.focused(), /unverified/);
  await assert.rejects(app.bridge.focus({}), /unverified/);
  await assert.rejects(app.bridge.zoom(), /unverified/);
  await assert.rejects(app.bridge.readPane({}), /unverified/);
  assert.deepEqual(await app.bridge.collapse(), { removed: 0 });
});

test('disabled App routing refuses the profile and context reuse detaches its previous owner', async () => {
  const disabled = harness();
  assert.throws(() => disabled.controller('herdr-app'), /Unknown/);
  await disabled.appear('herdr-app');
  assert.throws(() => disabled.controller('herdr-app'), /Unknown/);
  const h = harness({ experimentalHerdrApp: true });
  await h.appear('rex');
  const context = 'rex:0,0';
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'willAppear',
      context,
      payload: {
        settings: { profileScope: 'herdr-app' },
        coordinates: { row: 0, column: 0 },
      },
    }),
  );
  await h.api.settled();
  assert(!h.api.keys.has(context));
  assert(h.controller('herdr-app').keys.has(context));
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'willAppear',
      context,
      payload: {
        settings: { profileScope: 'herdr' },
        coordinates: { row: 0, column: 0 },
      },
    }),
  );
  await h.api.settled();
  assert(!h.controller('herdr-app').keys.has(context));
  assert(h.controller('herdr').keys.has(context));
});

test('App read-back and input consents are independent and are rechecked at the last I/O edge', async () => {
  const target = {
    session: 'sample',
    block: 't1',
    pid: 42,
    app: 'codex',
    name: 'codex',
    state: 'blocked',
    kind: 'question',
  };
  const current = {
    scope: 'herdr-app',
    appearance: 1,
    visibility: 1,
    generation: 1,
    backendKey: 'sample',
    page: 1,
    stamp: 'same',
  };
  const context = {
    ...current,
    action: 'questionPrev',
    controlId: 'questionPrev',
    verificationKey: 'sample',
    target,
    armedAt: 0,
    setupBusy: false,
    verifyChat: false,
  };
  const session = new HerdrAppPreview({
    backend: 'herdr-app',
    herdrApp: { readbackEnabled: false, inputEnabled: false },
  });
  session.agents = [target];
  session.lastTarget = target;
  const kernel = new DeliveryKernel(
    session,
    new GuardPipeline(() => current),
    () => context,
    (driver, authority) =>
      new GuardedBackend(
        'herdr-app',
        new Set(backendCapabilities.rex),
        driver,
        authority,
        'sample',
        {
          key: 'sample',
          controls: new Set(['questionPrev', 'focus']),
        },
      ),
  );
  await kernel.backend.connect(new AbortController().signal);
  let writes = 0;
  const operation = async (beforeIO) => {
    beforeIO();
    writes++;
  };
  const route = (op) =>
    kernel.rpc('agent.send_keys', { target: 't1', keys: ['shift+tab'] }, op);
  await assert.rejects(route(operation), /read-back/);
  session.config.herdrApp.readbackEnabled = true;
  await assert.rejects(route(operation), /App input/);
  session.config.herdrApp.inputEnabled = true;
  await route(operation);
  for (const flag of ['readbackEnabled', 'inputEnabled']) {
    await assert.rejects(
      route(async (beforeIO) => {
        session.config.herdrApp[flag] = false;
        beforeIO();
        writes++;
      }),
    );
    session.config.herdrApp[flag] = true;
  }
  assert.equal(writes, 1);
  context.action = 'next';
  context.controlId = 'focus';
  session.config.herdrApp.inputEnabled = false;
  await kernel.activation(target, operation);
  assert.equal(
    writes,
    2,
    'verified focus needs read-back consent but not native input consent',
  );
});
