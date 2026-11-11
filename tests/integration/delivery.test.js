'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GuardPipeline } = require('../../src/guards/pipeline.ts');
const { DeliveryKernel } = require('../../src/app/delivery.ts');
test('all legacy input adapters and provider writes use the final visibility gate', async () => {
  const target = {
    session: 's',
    block: 'b',
    pid: 42,
    name: 'codex',
    app: 'codex',
    state: 'idle',
  };
  const current = {
    scope: 'rex',
    appearance: 1,
    visibility: 1,
    generation: 1,
    backendKey: 'rex',
    page: 0,
    stamp: 'stamp',
    visible: true,
  };
  const display = {
    ...current,
    action: 'model',
    target,
    armedAt: 0,
    setupBusy: false,
    verifyChat: true,
  };
  let active = display,
    writes = 0;
  const operation = async () => {
    writes++;
    return 'ok';
  };
  const session = {
    generation: 1,
    config: { backend: 'rex', allowClipboardFocus: true },
    agents: [target],
    discover: async () => [target],
    focused: async () => target,
    focus: operation,
    zoom: operation,
    readPane: async () => ({ text: 'fixture' }),
  };
  const kernel = new DeliveryKernel(
    session,
    new GuardPipeline(() => current),
    () => active,
  );
  await kernel.run(
    ['send-key', '-s', 's', '-b', 'b', 'enter'],
    undefined,
    operation,
  );
  assert.equal(writes, 1);
  current.visible = false;
  for (const call of [
    () =>
      kernel.run(
        ['send-key', '-s', 's', '-b', 'b', 'enter'],
        undefined,
        operation,
      ),
    () => kernel.run(['send', '-s', 's', '-b', 'b'], 'fixture', operation),
    () => kernel.run(['focus', '-s', 's', 'b'], undefined, operation),
    () =>
      kernel.rpc(
        'agent.send_keys',
        { target: 'b', keys: ['enter'] },
        operation,
      ),
    () => kernel.mutation(target, 'thread/settings/update', operation),
  ])
    await assert.rejects(call, /Profile changed/);
  assert.equal(
    writes,
    1,
    'late disappearance cannot leak keys, paste, focus or daemon writes',
  );
  current.visible = true;
  await assert.rejects(
    () => kernel.run(['new-input-path'], undefined, operation),
    /Unsupported/,
  );
  assert.equal(
    writes,
    1,
    'unknown terminal methods never default to read-only',
  );
  active = null;
  await assert.rejects(
    () => kernel.mutation(target, 'thread/settings/update', operation),
    /No guarded press/,
  );
  assert.equal(writes, 1);
});
test('delayed native edges recheck visibility, generation and current consent immediately before I/O', async () => {
  const target = {
    session: 's',
    block: 'b',
    pid: 42,
    name: 'codex',
    app: 'codex',
    state: 'idle',
  };
  const current = {
    scope: 'rex',
    appearance: 1,
    visibility: 1,
    generation: 1,
    backendKey: 'rex',
    page: 0,
    stamp: 'same',
    visible: true,
  };
  let active = {
      ...current,
      action: 'interrupt',
      target,
      armedAt: 0,
      setupBusy: false,
      verifyChat: true,
    },
    writes = 0;
  const session = {
    generation: 1,
    config: { backend: 'rex', allowClipboardFocus: true },
    agents: [target],
    discover: async () => [target],
    focused: async () => target,
    focus: async () => {},
    zoom: async () => {},
    readPane: async () => ({ text: 'fixture' }),
  };
  const kernel = new DeliveryKernel(
    session,
    new GuardPipeline(() => current),
    () => active,
  );
  async function delayed(change, route) {
    return route(async (beforeIO) => {
      await Promise.resolve();
      change();
      beforeIO();
      writes++;
    });
  }
  // The same pane, thread and turn can all reappear after a verified unload.
  // Only a fresh press can use the newly observed binding.
  target.codexBindingEpoch = 1;
  for (const [change, restore] of [
    [
      () => (session.agents = [{ ...target, codexBindingEpoch: 2 }]),
      () => (session.agents = [target]),
    ],
    [() => (current.visible = false), () => (current.visible = true)],
    [() => (current.generation = 2), () => (current.generation = 1)],
    [
      () => (session.config.allowClipboardFocus = false),
      () => (session.config.allowClipboardFocus = true),
    ],
  ]) {
    await assert.rejects(
      delayed(change, (operation) =>
        kernel.run(
          ['send-key', '-s', 's', '-b', 'b', 'enter'],
          undefined,
          operation,
        ),
      ),
    );
    restore();
    await assert.rejects(
      delayed(change, (operation) =>
        kernel.mutation(target, 'thread/settings/update', operation),
      ),
    );
    restore();
  }
  assert.equal(writes, 0);
  await delayed(
    () => {},
    (operation) =>
      kernel.run(['send', '-s', 's', '-b', 'b'], 'fixture', operation),
  );
  assert.equal(writes, 1);
  active = null;
  await assert.rejects(
    kernel.activation(target, async () => {
      writes++;
    }),
  );
  assert.equal(writes, 1);
});
test('delivery adapter exposes only enumerated reads and preserves target/capability consent at each native route', async () => {
  const target = {
    session: 's',
    block: 'b',
    pid: 42,
    app: 'codex',
    name: 'codex',
    state: 'idle',
  };
  const current = {
    scope: 'rex',
    appearance: 1,
    visibility: 1,
    generation: 1,
    backendKey: 'rex',
    page: 0,
    stamp: 'same',
    visible: true,
  };
  let active = {
      ...current,
      action: 'zoom',
      target,
      armedAt: 0,
      setupBusy: false,
      verifyChat: false,
    },
    writes = 0,
    reads = 0;
  const operation = async (beforeIO) => {
    beforeIO();
    writes++;
  };
  const session = {
    generation: 1,
    config: { backend: 'rex', allowClipboardFocus: true },
    agents: [target],
    lastTarget: target,
    discover: async () => {
      reads++;
      return [target];
    },
    focused: async () => target,
    focus: async () => {
      writes++;
    },
    zoom: async () => {
      writes++;
    },
    readPane: async () => ({ text: 'fixture' }),
  };
  const guards = new GuardPipeline(() => current),
    kernel = new DeliveryKernel(session, guards, () => active);
  for (const args of [
    ['client', 'ls', '--json'],
    ['ls', '--json'],
    ['session', 'inspect', 's', '--json'],
    ['block', 'call', '-s', 's', '-b', 'b', 'process'],
  ])
    await kernel.run(args, undefined, async () => {
      reads++;
    });
  for (const method of [
    'session.snapshot',
    'agent.get',
    'pane.process_info',
    'pane.get',
    'agent.read',
  ])
    await kernel.rpc(method, {}, async () => {
      reads++;
    });
  assert.equal(writes, 0);
  for (const args of [
    ['client', 'ls', '--json', 'extra'],
    ['block', 'call', '-s', 's', '-b', 'b', 'new-input'],
    ['send-key', '-s', 'other', '-b', 'missing', 'enter'],
  ])
    await assert.rejects(kernel.run(args, undefined, operation));
  await assert.rejects(kernel.rpc('unknown.mutation', {}, operation));
  await kernel.run(
    ['-C', 'fixture', 'do', 'session.select'],
    undefined,
    operation,
    target,
  );
  await kernel.run(['zoom', '-s', 's', 'b'], undefined, operation);
  await kernel.rpc('agent.focus', { target: 'b' }, operation);
  await kernel.rpc('pane.zoom', { pane_id: 'b' }, operation);
  await kernel.backend.discover();
  await kernel.backend.focused();
  await kernel.backend.focus(target);
  await kernel.backend.zoom(target);
  assert.deepEqual(await kernel.backend.readPane(target), { text: 'fixture' });
  assert.equal(writes, 6);
  assert.equal(reads, 10);
  session.config.backend = 'herdr';
  session.config.herdr = { titleIdentity: false };
  await assert.rejects(
    kernel.rpc('agent.send_keys', { target: 'b', keys: ['up'] }, operation),
    /title identity/,
  );
  session.config.herdr.titleIdentity = true;
  await kernel.rpc('agent.send_keys', { target: 'b', keys: ['up'] }, operation);
  target.app = 'claude-code';
  session.config.claude = { enabled: false };
  await assert.rejects(
    kernel.rpc('agent.send_keys', { target: 'b', keys: ['up'] }, operation),
    /Claude/,
  );
  session.config.claude.enabled = true;
  await kernel.rpc('agent.send_keys', { target: 'b', keys: ['up'] }, operation);
  active = null;
  kernel.assertVisible();
  await kernel.run(['ls', '--json'], undefined, async () => {
    reads++;
  });
  await assert.rejects(
    kernel.run(['send', '-s', 's', '-b', 'b'], 'fixture', operation),
  );
});
test('a standalone production session cannot treat an unknown block method as a read', () => {
  const { Bridge } = require('../../src/app/session');
  const session = new Bridge(
    require('../../com.kotl3r.deckshep.sdPlugin/config.json'),
  );
  for (const args of [
    ['block', 'call', '-s', 's', '-b', 'b', 'new-native-input'],
    ['session', 'delete', 's'],
    ['client', 'do', 'send'],
  ])
    assert.throws(() => session.run(args), /No guarded press/);
});
