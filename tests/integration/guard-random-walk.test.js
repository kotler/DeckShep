'use strict';
// Seeded random walks over state changes, pane switches, process
// replacement, clock advances and presses. The walk checks properties that
// must hold whatever the order of events, not a scripted path:
//   1. a press drawn before the agent, process or selection changed sends
//      nothing;
//   2. input only ever goes to the pane the pressed key was drawn for, and
//      only while that pane still runs the process it was drawn for;
//   3. a refusal is shown in at most 15 characters;
//   4. no press throws.
// Synthetic agents only; no terminal is read or written.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');

function random(seed) {
  let s = seed >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const STATES = [
  { state: 'idle', kind: undefined },
  { state: 'working', kind: undefined },
  { state: 'done', kind: undefined },
  { state: 'error', kind: undefined },
  { state: 'unknown', kind: undefined },
  { state: 'blocked', kind: 'question' },
  { state: 'blocked', kind: 'permission' },
];
const NAVIGATION = [
  'next',
  'previous',
  'banknext',
  'bankprev',
  'collapse',
  'attention',
];
const inputBlock = (call) => {
  const at = call.args?.indexOf('-b');
  return at >= 0 ? call.args[at + 1] : null;
};
const isInput = (call) =>
  !!call.cycle || ['send', 'send-key', 'focus'].includes(call.args?.[0]);

async function walk(seed, steps) {
  const next = random(seed),
    pick = (list) => list[Math.floor(next() * list.length)];
  const h = harness();
  await h.ready();
  // Selecting an agent goes through focus(); record it like any other effect.
  const focus = h.api.bridge.focus.bind(h.api.bridge);
  h.api.bridge.focus = async (target) => {
    // The fixture refuses a replaced process before it would focus.
    await focus(target);
    h.calls.push({ focus: true, args: ['focus', '-b', target.block] });
  };
  let version = 1,
    pid = 100,
    stalePresses = 0,
    livePresses = 0,
    delivered = 0;
  const trail = [];
  const fail = (message) =>
    assert.fail(`seed ${seed}: ${message}\n${trail.slice(-12).join('\n')}`);
  for (let step = 0; step < steps; step++) {
    const roll = next();
    if (roll < 0.25) {
      const block = pick(['a', 'b']);
      h.change(block, { ...pick(STATES), statusAt: 'v' + ++version });
      trail.push(`state ${block}`);
      await h.api.refresh();
    } else if (roll < 0.35) {
      const block = pick(['a', 'b']);
      h.native(block);
      trail.push(`visible ${block}`);
      await h.api.refresh();
    } else if (roll < 0.42) {
      const block = pick(['a', 'b']);
      h.change(block, { pid: ++pid });
      trail.push(`process ${block}`);
      await h.api.refresh();
    } else if (roll < 0.5) {
      h.tick(pick([100, 400, 2500]));
      trail.push('tick');
    } else {
      const row = pick([0, 1, 2]),
        column = pick([0, 1, 2, 3, 4]),
        key = h.api.keys.get(`${row},${column}`);
      const drawn = key.presented;
      // Sometimes change the world between drawing and pressing.
      let stale = false;
      if (drawn && next() < 0.4) {
        const target = drawn.target;
        const block = target?.block || 'a';
        const how = pick(['process', 'state']);
        const before = h.live.find((a) => a.block === block);
        if (how === 'process') h.change(block, { pid: ++pid });
        else {
          const other = STATES.filter(
            (s) => s.state !== before.state || s.kind !== before.kind,
          );
          h.change(block, { ...pick(other), statusAt: 'v' + ++version });
        }
        await h.api.refresh();
        // Only a change the drawn key depended on makes the press stale. An
        // agent key selects a pane whatever the agent is doing, so only a
        // replaced process invalidates it. Next, Page, Collapse and Attention
        // act on other panes and are checked by their own tests.
        const action = String(drawn.action);
        if (!target || NAVIGATION.includes(action)) stale = false;
        else if (action.startsWith('agent:')) stale = how === 'process';
        else stale = key.presented?.stamp !== drawn.stamp || how === 'process';
      }
      const sent = h.calls.length;
      trail.push(
        `press ${row},${column} ${drawn?.action}${stale ? ' stale' : ''}`,
      );
      try {
        await h.press(row, column, drawn);
      } catch (error) {
        fail(`press threw ${error.message}`);
      }
      const added = h.calls.slice(sent).filter(isInput);
      if (stale) {
        stalePresses++;
        if (added.length)
          fail(`a stale ${drawn.action} press sent ${JSON.stringify(added)}`);
      } else {
        livePresses++;
        for (const call of added) {
          delivered++;
          const block = NAVIGATION.includes(String(drawn?.action))
            ? null
            : inputBlock(call);
          if (block && drawn?.target && block !== drawn.target.block)
            fail(
              `${drawn.action} wrote to ${block}, drawn for ${drawn.target.block}`,
            );
          if (block && drawn?.target) {
            const now = h.live.find((a) => a.block === block);
            if (!now || now.pid !== drawn.target.pid)
              fail(`${drawn.action} wrote to a replaced process in ${block}`);
          }
        }
      }
      const message = key.feedback?.message;
      if (message !== undefined && message.length > 15)
        fail(`refusal "${message}" is longer than 15 characters`);
    }
  }
  return { stalePresses, livePresses, delivered };
}

test('random walks keep input on the drawn pane and refuse stale presses', async () => {
  const totals = { stalePresses: 0, livePresses: 0, delivered: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const result = await walk(seed, 120);
    for (const key of Object.keys(totals)) totals[key] += result[key];
  }
  // The walk must actually exercise both kinds of press and some deliveries,
  // or the properties above were checked against nothing.
  assert(totals.stalePresses > 200, JSON.stringify(totals));
  assert(totals.livePresses > 500, JSON.stringify(totals));
  assert(totals.delivered > 50, JSON.stringify(totals));
});
