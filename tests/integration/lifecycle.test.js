'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  { Bridge } = require('../../src/app/session'),
  { harness } = require('../helpers/plugin-harness');
test('lifecycle', async () => {
  const h = harness({ fixtureConsent: true });
  await h.ready();
  const base = h.live[0];
  h.api.bridge.slots = [];
  h.api.bridge.lastTarget = null;
  h.setLive(
    Array.from({ length: 13 }, (_, i) => ({
      ...base,
      block: 'agent-' + i,
      pid: 100 + i,
      chatId: 'chat-' + i,
    })),
  );
  await h.api.refresh();
  assert.equal(h.action(1, 0), 'next');
  assert.equal(h.action(1, 1), 'banknext');
  assert.equal(h.action(1, 2), 'none');
  await h.press(0, 0);
  await h.press(1, 1);
  await h.press(1, 1);
  assert.equal(h.api.getBank(), 2);
  assert(h.image(1, 1).includes('3/3'));
  const prior = h.api.keys.get('0,0').presented;
  h.setLive(h.live.filter((_, i) => ![1, 3, 5, 8, 9, 10, 11, 12].includes(i)));
  await h.api.refresh();
  assert(h.image(0, 0).includes('Closed'));
  assert.equal(h.api.getBank(), 2);
  const calls = h.calls.length;
  await h.press(0, 0, prior);
  assert.equal(h.calls.length, calls);
  await h.press(1, 2);
  assert.equal(h.api.getBank(), 0);
  assert.deepEqual(
    Array.from(h.api.bridge.slots, (s) => s.block),
    ['agent-0', 'agent-2', 'agent-4', 'agent-6', 'agent-7'],
  );
  assert(h.image(0, 0).includes('id="selected-agent"'));
  // A unique restart gets a fresh local selection, never the old press authority.
  const oldProcess = h.api.keys.get('0,0').presented;
  h.change('agent-0', { pid: 999, chatId: 'new-chat' });
  await h.api.refresh();
  assert(h.image(0, 0).includes('id="selected-agent"'));
  assert.equal(h.api.selected().pid, 999);
  const beforeRestartPress = h.calls.length;
  await h.press(0, 0, oldProcess);
  assert.equal(h.calls.length, beforeRestartPress);
  h.setLive([]);
  await h.api.refresh();
  await h.press(1, 2);
  assert.equal(h.api.getBank(), 0);
  assert.equal(h.api.bridge.slots.length, 0);
  assert(h.image(0, 0).includes('No agent'));
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((c) => h.action(1, c)),
    Array(5).fill('none'),
  );
  // Next agent must bring its selected slot into view, including bank wraparound.
  const nav = harness({ fixtureConsent: true });
  await nav.ready();
  const navBase = nav.live[0];
  nav.api.bridge.slots = [];
  nav.setLive(
    Array.from({ length: 6 }, (_, i) => ({
      ...navBase,
      block: 'nav-' + i,
      pid: 700 + i,
      chatId: 'chat-nav-' + i,
    })),
  );
  await nav.api.refresh();
  await nav.press(0, 4);
  await nav.press(1, 0);
  assert.equal(nav.api.selected().block, 'nav-5');
  assert.equal(nav.api.getBank(), 1);
  assert(nav.image(0, 0).includes('id="selected-agent"'));
  await nav.press(1, 0);
  assert.equal(nav.api.selected().block, 'nav-0');
  assert.equal(nav.api.getBank(), 0);
  assert(nav.image(0, 0).includes('id="selected-agent"'));
  nav.setLive([nav.live[0]]);
  await nav.api.refresh();
  assert.equal(nav.action(1, 0), 'none');
  assert.equal(nav.action(1, 2), 'collapse');
  await nav.press(1, 2);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((c) => nav.action(1, c)),
    Array(5).fill('none'),
  );
  const valid = {
    client_id: 'c',
    info: { kind: 'app', platform: 'macos', name: 'Rex Beta' },
    connection_state: 'connected',
  };
  const full = {
    windows: [
      {
        window_id: 'w',
        layers: [
          {
            blocks: [
              { block_id: 'b', creator_name: 'com.superlogical.terminal' },
            ],
          },
        ],
      },
    ],
  };
  for (const broken of [
    'sessions',
    'session-id',
    'windows',
    'layers',
    'blocks',
    'process',
  ]) {
    const b = new Bridge({}, async (args) => {
      if (args[0] === 'client') return { clients: [valid] };
      if (args[0] === 'ls')
        return broken === 'sessions'
          ? {}
          : {
              sessions: broken === 'session-id' ? [{}] : [{ session_id: 's' }],
            };
      if (args[0] === 'session')
        return broken === 'windows'
          ? {}
          : broken === 'layers'
            ? { windows: [{ window_id: 'w' }] }
            : broken === 'blocks'
              ? { windows: [{ window_id: 'w', layers: [{}] }] }
              : full;
      if (args.at(-1) === 'process') return {};
      throw Error('Unexpected call');
    });
    b.slots = [{ session: 's', block: 'existing' }];
    const draft = (b.draft = { unsent: true });
    await assert.rejects(() => b.collapse());
    assert.deepEqual(b.slots, [{ session: 's', block: 'existing' }]);
    assert.equal(b.draft, draft);
  }
  console.log(
    'PASS thirteen-agent banks, closure gaps, stale slot presses, Collapse/clamping, replacement identity, empty bank and partial-discovery preservation',
  );
});
