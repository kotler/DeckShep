'use strict';
const assert = require('node:assert/strict');
const { Bridge } = require('./com.local.rexagents.sdPlugin/core');
const slot = (block, session = 's') => ({ session, block });
const live = (block, session = 's') => ({
  ...slot(block, session),
  app: 'codex',
  pid: block.charCodeAt(0),
  state: 'idle',
});
(async () => {
  const bridge = new Bridge(
    {},
    async () => {
      throw Error('Must not send input or change Rex focus');
    },
    async () => {
      throw Error('Must not activate Rex');
    },
    async () => {
      throw Error('Must not use clipboard');
    },
  );
  bridge.slots = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((b) => slot(b));
  bridge.agents = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((b) => live(b));
  const draft = { unsent: true },
    picker = { phase: 'model' },
    target = { ...slot('g'), pid: 103 };
  bridge.draft = draft;
  bridge.picker = picker;
  bridge.lastTarget = target;
  let reads = 0;
  bridge.discover = async () => {
    reads++;
    bridge.agents = ['a', 'c', 'd', 'f', 'g'].map((b) => live(b));
    return bridge.agents;
  };
  assert.equal(bridge.slotGaps(), 0); // Closure is not assumed from stale metadata.
  const result = await bridge.collapse();
  assert.equal(reads, 1);
  assert.equal(result.removed, 2);
  assert.deepEqual(
    bridge.slots.map((s) => s.block),
    ['a', 'c', 'd', 'f', 'g'],
  );
  assert.equal(bridge.draft, draft);
  assert.equal(bridge.picker, picker);
  assert.equal(bridge.lastTarget, target);
  assert.equal((await bridge.collapse()).removed, 0);
  assert.equal(bridge.slots.length, 5);
  bridge.slots = [slot('a'), slot('a', 'other'), slot('closed')];
  bridge.discover = async () => {
    bridge.agents = [live('a'), live('a', 'other')];
  };
  await bridge.collapse();
  assert.deepEqual(bridge.slots, [slot('a'), slot('a', 'other')]);
  const before = structuredClone(bridge.slots);
  bridge.discover = async () => {
    throw Error('Offline or incomplete discovery');
  };
  await assert.rejects(() => bridge.collapse());
  assert.deepEqual(bridge.slots, before);
  bridge.slots = [slot('closed')];
  bridge.discover = async () => {
    bridge.agents = [];
  };
  assert.equal((await bridge.collapse()).removed, 1);
  assert.deepEqual(bridge.slots, []);

  const cycle = new Bridge({}),
    first = live('a'),
    last = live('z', 'other-session');
  let selected = last;
  cycle.discover = async () => {
    cycle.agents = [first, last];
    return cycle.agents;
  };
  cycle.focused = async () => selected;
  cycle.focus = async (agent) => {
    selected = agent;
  };
  await cycle.navigate(1);
  assert.equal(selected, first);
  await cycle.navigate(1);
  assert.equal(selected, last);
  cycle.discover = async () => {
    cycle.agents = [first];
  };
  selected = first;
  await cycle.navigate(1);
  assert.equal(selected, first);
  cycle.discover = async () => {
    cycle.agents = [];
  };
  await assert.rejects(() => cycle.navigate(1), /No agents/);

  console.log(
    'PASS explicit collapse, fresh discovery, stable overflow order, draft/focus preservation, offline guard, empty/idempotent collapse and forward agent wraparound',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
