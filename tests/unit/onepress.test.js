'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../com.local.rexagents.sdPlugin/presets');
const { Bridge, token } = require('../../com.local.rexagents.sdPlugin/core');
const defaults = require('../../com.local.rexagents.sdPlugin/config.json');
test('onepress', async () => {
  const config = {
      ...defaults,
      modelDiscovery: { enabled: false },
      daemonControls: { enabled: false },
    },
    a = {
      session: 's',
      block: 'b',
      app: 'codex',
      pid: 42,
      name: 'codex',
      state: 'idle',
    };
  const baseline =
    '/permissions :workspace --approval-policy=on-request --reviewer=user';
  const entries = P.choices(config.cycles, baseline);
  assert.equal(entries.length, 9);
  assert(
    entries
      .find((e) => e.slot === '8')
      .input.includes('--reviewer=auto_review'),
  );
  assert(entries.find((e) => e.slot === '9').input.includes('--reviewer=user'));
  assert(entries.every((e) => !e.input.includes('danger-full-access')));
  assert.equal(entries[0].input, '/model gpt-6.1-sol');
  assert.equal(entries[3].input, '/model --reasoning=low');
  const calls = [];
  const b = new Bridge(config, async (args) => calls.push(args));
  b.focused = async () => a;
  const record = {
      entries,
      signature: P.signature(config.cycles),
      indices: { model: 0, effort: 0, permissions: 0 },
    },
    registry = { agents: { [token(a)]: record } };
  const old = {
    readRegistry: P.readRegistry,
    saveRegistry: P.saveRegistry,
    validateOnDisk: P.validateOnDisk,
  };
  P.readRegistry = () => registry;
  P.saveRegistry = () => {};
  P.validateOnDisk = () => {};
  try {
    for (let i = 0; i < 4; i++) await b.cycleControl('model');
    assert.deepEqual(
      calls.map((a) => a.at(-1)),
      ['1', '2', '3', '1'],
    );
    assert(
      calls.every((a) => a.slice(-3).join(',') === 'ctrl+x,p,' + a.at(-1)),
    );
    calls.length = 0;
    await b.cycleControl('permissions');
    await b.cycleControl('permissions');
    assert.deepEqual(
      calls.map((a) => a.at(-1)),
      ['8', '9'],
    );
    calls.length = 0;
    await b.togglePlan();
    assert.equal(calls[0].at(-1), 'shift+tab');
    P.validateOnDisk = () => {
      throw Error('Preset modified');
    };
    const n = calls.length;
    await assert.rejects(() => b.cycleControl('permissions'));
    assert.equal(calls.length, n);
    a.state = 'blocked';
    await assert.rejects(() => b.togglePlan());
    a.state = 'idle';
    record.signature = 'old';
    await assert.rejects(() => b.cycleControl('model'));
    console.log(
      'PASS independent model/effort/permissions cycles, Plan toggle, no composer submit keys, baseline boundaries, preset tamper and readiness guards',
    );
  } finally {
    Object.assign(P, old);
  }
});
