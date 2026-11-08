'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GuardPipeline } = require('../../src/guards/pipeline.ts');
const { RexBackend } = require('../../src/terminals/rex/backend.ts');
const { HerdrTuiBackend } = require('../../src/terminals/herdr-tui/backend.ts');
const { FixtureBackend } = require('../../src/terminals/contract/fixture.ts');
const inputs = [
  { kind: 'keys', keys: ['enter'] }, { kind: 'paste', text: 'fixture' },
  { kind: 'focus' }, { kind: 'selectWindow' }, { kind: 'zoom' },
  { kind: 'providerMutation', method: 'thread/settings/update' },
];
for (const Backend of [RexBackend, HerdrTuiBackend, FixtureBackend]) {
  test(Backend.name + ': shared discovery/focus/generation/delivery contract', async () => {
    const agents = ['a', 'b'].map((block, index) => ({ session: 'fixture', block, pid: 100 + index, name: 'codex', app: 'codex', state: 'idle' }));
    const scene = { agents, focused: 'b', calls: [] };
    const current = { scope: 'rex', appearance: 1, visibility: 1, generation: 1, backendKey: 'fixture', page: 0, stamp: 'stamp', visible: true };
    const guards = new GuardPipeline(() => current, () => 1000);
    const context = { ...current, action: 'model', target: agents[0], armedAt: 0, setupBusy: false, verifyChat: false };
    let backend;
    const authority = { issue: target => guards.issue(context, target, backend.generation), consume: (...args) => guards.consume(...args) };
    const driver = {
      discover: async () => [...scene.agents], focused: async () => scene.agents.find(a => a.block === scene.focused),
      focus: async target => { scene.focused = target.block; },
      execute: async (_target, input) => { scene.calls.push(input); if (scene.timeout) throw Error('Fixture transport timeout'); },
    };
    backend = Backend === FixtureBackend ? new Backend(scene, authority) : new Backend(driver, authority);
    await backend.connect(new AbortController().signal);
    assert.deepEqual(await backend.discover(), agents);
    assert.equal((await backend.focused()).block, 'b', 'focus comes from native truth, not the selected key');
    for (const input of inputs) {
      const token = authority.issue(agents[0]);
      current.visibility++;
      await assert.rejects(() => backend.deliver(agents[0], input, token));
      current.visibility--;
      assert.equal(scene.calls.length, 0, input.kind + ' must refuse stale visibility');
    }
    for (const patch of [{ generation: 2 }, { appearance: 2 }, { scope: 'herdr' }, { backendKey: 'changed' }, { visible: false }]) {
      const token = authority.issue(agents[0]), before = { ...current };
      Object.assign(current, patch);
      await assert.rejects(() => backend.deliver(agents[0], inputs[0], token));
      Object.assign(current, before);
      assert.equal(scene.calls.length, 0);
    }
    const wrong = authority.issue(agents[0]);
    await assert.rejects(() => backend.deliver(agents[1], inputs[0], wrong));
    assert.equal(scene.calls.length, 0);
    const token = authority.issue(agents[0]);
    await backend.deliver(agents[0], inputs[0], token);
    await assert.rejects(() => backend.deliver(agents[0], inputs[0], token));
    assert.equal(scene.calls.length, 1, 'a consumed permit cannot repeat input');
    const previous = authority.issue(agents[0]);
    await backend.connect(new AbortController().signal);
    current.generation = backend.generation;
    await assert.rejects(() => backend.deliver(agents[0], inputs[0], previous));
    context.generation = backend.generation;
    scene.timeout = true;
    const uncertain = authority.issue(agents[0]);
    await assert.rejects(() => backend.deliver(agents[0], inputs[0], uncertain), /timeout/);
    await assert.rejects(() => backend.deliver(agents[0], inputs[0], uncertain));
    assert.equal(scene.calls.length, 2, 'uncertain writes never retry');
    await backend.dispose();
    await assert.rejects(() => backend.discover(), /disconnected/);
  });
}
