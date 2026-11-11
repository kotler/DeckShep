const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GuardedBackend } = require('../../src/terminals/contract/backend');
const { DeliveryKernel } = require('../../src/app/delivery');
const { GuardPipeline } = require('../../src/guards/pipeline');
const {
  controlIdForAction,
  controlSpec,
  supported,
  verifiedAction,
  backendCapabilities,
} = require('../../src/domain/capabilities');
const {
  assertVerifiedControl,
  assertVerifiedInput,
} = require('../../src/guards/verified-control');
const { layout } = require('../../src/domain/layout');
const { CodexProvider } = require('../../src/agents/codex/provider');
const { harness } = require('../helpers/plugin-harness');

class AppFixtureBackend extends GuardedBackend {
  change(record) {
    this.replaceVerification(record);
  }
}
async function fixture(controls = ['questionPrev', 'questionNext']) {
  const target = {
    session: 'sample',
    block: 't1',
    pid: 42,
    name: 'codex',
    app: 'codex',
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
    visible: true,
  };
  let active = {
    ...current,
    action: 'questionPrev',
    controlId: 'questionPrev',
    verificationKey: 'questions-v1',
    target,
    armedAt: 0,
    setupBusy: false,
    verifyChat: false,
  };
  let issued = 0,
    writes = 0;
  const guards = new GuardPipeline(() => current);
  const issue = guards.issue.bind(guards);
  guards.issue = (...args) => {
    issued++;
    return issue(...args);
  };
  const session = {
    generation: 1,
    config: {
      backend: 'herdr-app',
      herdrApp: { readbackEnabled: true, inputEnabled: true },
    },
    agents: [target],
    lastTarget: target,
    discover: async () => [target],
    focused: async () => target,
    focus: async () => {},
    zoom: async () => {},
    readPane: async () => ({ text: 'sample' }),
  };
  const kernel = new DeliveryKernel(
    session,
    guards,
    () => active,
    (driver, authority) =>
      new AppFixtureBackend(
        'herdr-app',
        new Set(backendCapabilities.rex),
        driver,
        authority,
        'sample',
        { key: 'questions-v1', controls: new Set(controls) },
      ),
  );
  await kernel.backend.connect(new AbortController().signal);
  return {
    kernel,
    guards,
    current,
    target,
    get context() {
      return active;
    },
    set context(value) {
      active = value;
    },
    get issued() {
      return issued;
    },
    get writes() {
      return writes;
    },
    operation: async (beforeIO) => {
      beforeIO();
      writes++;
    },
  };
}

test('a question-navigation record grants no unverified Home controls and preserves local navigation', async () => {
  const f = await fixture();
  const caps = f.kernel.backend.capabilities,
    controls = f.kernel.backend.verifiedControls;
  const row = layout(1, f.target, caps, controls);
  assert.deepEqual(row, [
    'none',
    'banknext',
    'collapse',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
  ]);
  for (const action of [
    'model',
    'effort',
    'interrupt',
    'approvalConfirm',
    'approvalEscape',
    'zoom',
    'agent:0',
    'next',
    'unknown',
  ])
    assert.equal(verifiedAction(action, caps, controls), false, action);
  assert(verifiedAction('banknext', caps, controls));
  assert.equal(controlIdForAction('agent:4'), 'focus');
  assert.equal(controlIdForAction('next'), 'focus');
  assert.equal(controlIdForAction('unknown'), null);
  assert.equal(
    supported(controlSpec('questionPrev'), new Set(), controls),
    false,
  );
  assert.equal(supported(controlSpec('focus'), caps, new Set(['focus'])), true);
  const clone = f.kernel.backend.verifiedControls;
  clone.add('model');
  assert(!f.kernel.backend.verifiedControls.has('model'));
  assert.equal(verifiedAction('model', caps, undefined), false);
  assert.throws(() =>
    assertVerifiedControl(
      {
        id: 'herdr-app',
        capabilities: caps,
        verificationKey: 'questions-v1',
      },
      f.context,
    ),
  );
});

test('unverified controls and custom-override actions fail before minting any permit', async () => {
  const f = await fixture();
  for (const action of [
    'approvalConfirm',
    'approvalEscape',
    'model',
    'effort',
    'interrupt',
    'unknown',
  ]) {
    f.context = { ...f.context, action, controlId: controlIdForAction(action) };
    await assert.rejects(
      f.kernel.rpc(
        'agent.send_keys',
        { target: 't1', keys: ['enter'] },
        f.operation,
      ),
      /unverified/,
    );
  }
  assert.equal(f.issued, 0);
  assert.equal(f.writes, 0);
  f.context = {
    ...f.context,
    action: 'questionPrev',
    controlId: 'questionPrev',
  };
  await f.kernel.rpc(
    'agent.send_keys',
    { target: 't1', keys: ['shift+tab'] },
    f.operation,
  );
  assert.equal(f.issued, 1);
  assert.equal(f.writes, 1);
});

test('record replacement invalidates captured presses, issued tokens and late native edges', async () => {
  const f = await fixture();
  const token = f.guards.issue(
    f.context,
    f.target,
    f.kernel.backend.generation,
  );
  f.kernel.backend.change({
    key: 'questions-v2',
    controls: new Set(['questionPrev']),
  });
  await assert.rejects(
    f.kernel.rpc(
      'agent.send_keys',
      { target: 't1', keys: ['up'] },
      f.operation,
    ),
    /unverified/,
  );
  await assert.rejects(
    f.kernel.backend.deliver(
      f.target,
      {
        kind: 'keys',
        keys: ['up'],
        controlId: 'questionPrev',
        verificationKey: 'questions-v1',
      },
      token,
    ),
  );
  f.current.generation = f.kernel.backend.generation;
  f.context = {
    ...f.context,
    generation: f.current.generation,
    verificationKey: 'questions-v2',
  };
  await assert.rejects(
    f.kernel.rpc(
      'agent.send_keys',
      { target: 't1', keys: ['up'] },
      async (beforeIO) => {
        f.kernel.backend.change({ key: 'questions-v3', controls: new Set() });
        beforeIO();
        throw Error('unreachable');
      },
    ),
    /unverified/,
  );
  assert.equal(f.writes, 0);
});

test('a permit binds the control and record; input kinds cannot borrow another control authority', async () => {
  const f = await fixture(['questionPrev', 'model', 'zoom', 'focus', 'send']);
  const token = f.guards.issue(
    f.context,
    f.target,
    f.kernel.backend.generation,
  );
  await assert.rejects(
    f.kernel.backend.deliver(
      f.target,
      {
        kind: 'keys',
        keys: ['enter'],
        controlId: 'model',
        verificationKey: 'questions-v1',
      },
      token,
    ),
    /Control input changed/,
  );
  await assert.rejects(
    f.kernel.backend.deliver(
      f.target,
      {
        kind: 'keys',
        keys: ['up'],
        controlId: 'questionPrev',
        verificationKey: 'questions-v1',
      },
      token,
    ),
    /expired/,
  );
  const backend = f.kernel.backend;
  for (const input of [
    { kind: 'keys', keys: ['enter'] },
    {
      kind: 'keys',
      keys: ['enter'],
      controlId: 'zoom',
      verificationKey: backend.verificationKey,
    },
    {
      kind: 'paste',
      text: 'sample',
      controlId: 'questionPrev',
      verificationKey: backend.verificationKey,
    },
    {
      kind: 'keys',
      keys: ['enter'],
      controlId: 'banknext',
      verificationKey: backend.verificationKey,
    },
  ])
    assert.throws(() => assertVerifiedInput(backend, input));
  assertVerifiedInput(backend, {
    kind: 'paste',
    text: 'sample',
    controlId: 'send',
    verificationKey: backend.verificationKey,
  });
  assertVerifiedInput(backend, {
    kind: 'zoom',
    controlId: 'zoom',
    verificationKey: backend.verificationKey,
  });
  assertVerifiedInput(backend, {
    kind: 'focus',
    controlId: 'focus',
    verificationKey: backend.verificationKey,
  });
  for (const patch of [
    { controlId: undefined },
    { action: 'model' },
    { verificationKey: '' },
  ])
    assert.throws(() =>
      assertVerifiedControl(backend, { ...f.context, ...patch }),
    );
});

test('provider execution checks the requested control rather than trusting the caller context', async () => {
  const f = await fixture();
  const provider = new CodexProvider();
  let calls = 0;
  const context = {
    press: f.context,
    backend: f.kernel.backend,
    operations: {
      execute: async () => {
        calls++;
      },
    },
  };
  await assert.rejects(provider.perform('model', context), /changed/);
  await provider.perform('questionPrev', context);
  assert.equal(calls, 1);
  f.kernel.backend.change({
    key: 'other',
    controls: new Set(['questionPrev']),
  });
  await assert.rejects(provider.perform('questionPrev', context), /unverified/);
});

test('controller custom overrides cannot render or execute unverified App controls', async () => {
  const h = harness();
  await h.ready();
  const backend = h.api.bridge.delivery.backend;
  // Explicit test injection only: production still has no App controller factory.
  Object.defineProperty(backend, 'id', { value: 'herdr-app' });
  Object.defineProperty(backend, 'verifiedControls', {
    get: () => new Set(['questionPrev']),
  });
  Object.defineProperty(backend, 'verificationKey', { value: 'questions-v1' });
  const key = h.api.keys.get('2,0');
  for (const action of [
    'model',
    'effort',
    'interrupt',
    'approvalConfirm',
    'approvalEscape',
    'unknown',
  ]) {
    key.settings.action = action;
    assert.equal(h.api.mapping(key), 'none');
    await h.api.press('2,0', {
      ...key.presented,
      action,
      controlId: controlIdForAction(action),
      verificationKey: 'questions-v1',
    });
  }
  assert.equal(h.calls.length, 0);
  key.settings.action = 'questionPrev';
  assert.equal(h.api.mapping(key), 'questionPrev');
  key.settings.action = 'banknext';
  assert.equal(h.api.mapping(key), 'none');
  h.api.bridge.slots.push(
    ...Array.from({ length: 4 }, (_, index) => ({
      session: 's',
      block: 'extra-' + index,
    })),
  );
  assert.equal(h.api.mapping(key), 'banknext');
});
