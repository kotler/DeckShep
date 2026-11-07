'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Bridge } = require('../../com.local.rexagents.sdPlugin/core');
const defaults = require('../../com.local.rexagents.sdPlugin/config.json');
test('effort', async () => {
  const calls = [],
    a = {
      session: 's',
      block: 'b',
      app: 'codex',
      pid: 1,
      name: 'codex',
      state: 'idle',
    };
  const b = new Bridge(structuredClone(defaults), async (args) =>
    calls.push(args),
  );
  b.focused = async () => a;
  b.draft = { target: a, action: 'review', at: Date.now() };
  const draft = b.draft;
  await b.adjustEffort('increase');
  await b.adjustEffort('decrease');
  assert.deepEqual(
    calls.map((c) => c.at(-1)),
    ['shift+up', 'shift+down'],
  );
  assert(calls.every((c) => c.slice(0, -1).join(',') === 'send-key,-s,s,-b,b'));
  assert.equal(b.draft, draft);
  async function refused(change, restore) {
    const n = calls.length;
    change();
    await assert.rejects(() => b.adjustEffort('increase'));
    assert.equal(calls.length, n);
    restore();
  }
  await refused(
    () => (a.state = 'working'),
    () => (a.state = 'idle'),
  );
  await refused(
    () => (a.app = 'claude-code'),
    () => (a.app = 'codex'),
  );
  await refused(
    () => (b.picker = {}),
    () => (b.picker = null),
  );
  await refused(
    () => (b.config.controlVerified.codex = false),
    () => (b.config.controlVerified.codex = true),
  );
  await refused(
    () => (b.config.effortKeys.increase = 'enter'),
    () => (b.config.effortKeys.increase = 'shift+up'),
  );
  let checks = 0;
  b.focused = async () => (++checks === 1 ? a : { ...a, pid: 2 });
  const n = calls.length;
  await assert.rejects(() => b.adjustEffort('decrease'));
  assert.equal(calls.length, n);
  console.log(
    'PASS native effort directions, no preset/catalog/submit, draft preservation and routing/refusal guards',
  );
});
