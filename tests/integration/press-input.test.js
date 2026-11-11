'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');

function fakeTimers() {
  let now = 0,
    next = 1;
  const pending = new Map();
  return {
    setTimeout(fn, ms) {
      const id = next++;
      pending.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...pending])
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
    },
  };
}
const agent = (block, over = {}) => ({
  session: 's',
  window: 'w' + block,
  block,
  pid: 100 + block.charCodeAt(0),
  name: 'codex',
  app: 'codex',
  cwd: '/project',
  state: 'idle',
  statusAt: 'v1',
  chatId: 'chat-' + block,
  chatName: 'Chat ' + block,
  terminalTitle: 'Chat ' + block,
  project: 'project',
  model: 'gpt-6-luna',
  ...over,
});

/** A Rex deck with `blocks` agents, `a` selected, every focus/navigate recorded. */
async function deck(blocks = ['a', 'b', 'c'], over = {}) {
  const timers = fakeTimers();
  let now = 10000;
  const h = harness({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    clock: () => now,
    ...over.dependencies,
  });
  h.setLive(blocks.map((b) => agent(b, over.state?.[b])));
  h.api.keys.clear();
  await h.appear('rex');
  const c = h.controller('rex');
  await h.profilePress('rex', 0, 0);
  now += 500;
  c.render();
  const calls = [];
  for (const method of ['focus', 'navigate']) {
    const original = c.bridge[method].bind(c.bridge);
    c.bridge[method] = async (...args) => {
      calls.push({ method, args });
      return original(...args);
    };
  }
  const context = (row, col) => `rex:${row},${col}`;
  const emit = (event, ctx) =>
    h.socket.emit('message', JSON.stringify({ event, context: ctx }));
  return {
    h,
    c,
    timers,
    calls,
    context,
    advanceClock: (ms) => (now += ms),
    down: (row, col) => emit('keyDown', context(row, col)),
    up: (row, col) => emit('keyUp', context(row, col)),
    gone: (row, col) => emit('willDisappear', context(row, col)),
    settle: () => h.api.settled(),
    key: (row, col) => c.keys.get(context(row, col)),
    focused: () => calls.filter((x) => x.method === 'focus'),
  };
}

test('Next: tap focuses the next agent, hold focuses the previous one', async () => {
  const d = await deck(['a', 'b', 'c']);
  assert.equal(d.c.mapping(d.key(1, 0)), 'next');
  d.down(1, 0);
  await d.settle();
  assert.equal(d.calls.length, 0, 'a held key waits for key up or the hold');
  d.up(1, 0);
  await d.settle();
  assert.deepEqual(
    d.focused().map((x) => x.args[0].block),
    ['b'],
  );
  assert.deepEqual(
    d.calls.filter((x) => x.method === 'navigate').map((x) => x.args),
    [[1]],
  );

  const e = await deck(['a', 'b', 'c']);
  e.down(1, 0);
  e.timers.advance(449);
  await e.settle();
  assert.equal(e.calls.length, 0);
  e.timers.advance(1);
  await e.settle();
  assert.deepEqual(
    e.focused().map((x) => x.args[0].block),
    ['c'],
    'previous from a wraps to the last agent',
  );
  assert.deepEqual(
    e.calls.filter((x) => x.method === 'navigate').map((x) => x.args),
    [[-1]],
  );
  e.up(1, 0);
  e.timers.advance(2000);
  await e.settle();
  assert.equal(e.focused().length, 1, 'the key up after a hold adds no tap');
});

test('Next hold moves the bank to the newly focused agent', async () => {
  const blocks = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const d = await deck(blocks);
  assert.equal(d.c.getBank(), 0);
  d.down(1, 0);
  d.timers.advance(450);
  await d.settle();
  assert.equal(d.focused()[0].args[0].block, 'g');
  assert.equal(d.c.getBank(), 1);
});

test('Page: tap goes to the next bank, hold to the previous with wrap', async () => {
  const d = await deck(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.equal(d.c.mapping(d.key(1, 1)), 'banknext');
  d.down(1, 1);
  d.up(1, 1);
  await d.settle();
  assert.equal(d.c.getBank(), 1);
  d.down(1, 1);
  d.timers.advance(450);
  await d.settle();
  assert.equal(d.c.getBank(), 0);
  d.up(1, 1);
  d.down(1, 1);
  d.timers.advance(450);
  await d.settle();
  assert.equal(d.c.getBank(), 1, 'previous bank wraps from the first');
  assert.equal(d.calls.length, 0, 'bank moves are purely local');
});

test('a key that disappears before its hold fires does nothing', async () => {
  const d = await deck(['a', 'b', 'c']);
  d.down(1, 0);
  d.gone(1, 0);
  d.timers.advance(5000);
  d.up(1, 0);
  await d.settle();
  assert.equal(d.calls.length, 0);
  assert.equal(d.h.calls.length, 0);
});

test('a stray key up fires nothing', async () => {
  const d = await deck(['a', 'b', 'c']);
  d.up(1, 0);
  d.up(1, 1);
  await d.settle();
  assert.equal(d.calls.length, 0);
});

test('keys without a hold action still press on key down', async () => {
  const d = await deck(['a', 'b', 'c']);
  d.down(0, 1);
  await d.settle();
  assert.deepEqual(
    d.focused().map((x) => x.args[0].block),
    ['b'],
  );
});

test('a hold is refused by the same guards as a tap when the generation changes', async () => {
  const d = await deck(['a', 'b', 'c']);
  d.down(1, 0);
  d.c.bridge.generation += 1;
  d.timers.advance(450);
  await d.settle();
  assert.equal(d.calls.length, 0, 'no backend call');
  assert.equal(d.h.calls.length, 0);
  assert.equal(d.key(1, 0).feedback.message, 'Profile changed');

  const tap = await deck(['a', 'b', 'c']);
  tap.down(1, 0);
  tap.c.bridge.generation += 1;
  tap.up(1, 0);
  await tap.settle();
  assert.equal(tap.calls.length, 0);
  assert.equal(tap.key(1, 0).feedback.message, 'Profile changed');
});

test('the hold acts on the context presented at key down, not a later one', async () => {
  const d = await deck(['a', 'b', 'c']);
  d.down(1, 0);
  const shown = d.key(1, 0).presented;
  d.h.change('c', { state: 'working' });
  await d.c.refresh();
  d.timers.advance(450);
  await d.settle();
  assert.equal(shown.action, 'next');
  assert.equal(d.focused().length, 1);
});

async function slowFirstPress(delayMs) {
  const d = await deck(['a', 'b', 'c']);
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const original = d.c.bridge.focus;
  let first = true;
  d.c.bridge.focus = async (target) => {
    if (first) {
      first = false;
      await gate;
    }
    return original.call(d.c.bridge, target);
  };
  d.down(0, 1);
  await new Promise((resolve) => setImmediate(resolve));
  d.down(0, 2);
  await new Promise((resolve) => setImmediate(resolve));
  d.advanceClock(delayMs);
  release();
  await d.settle();
  return d;
}

test('a press that waited over 2000 ms sends nothing and says Press again', async () => {
  const d = await slowFirstPress(2500);
  assert.deepEqual(
    d.focused().map((x) => x.args[0].block),
    ['b'],
    'only the first press reached the backend',
  );
  assert.equal(d.key(0, 2).feedback.message, 'Press again');
  assert(
    d.h.socket.frames.some(
      (f) => f.event === 'showAlert' && f.context === d.context(0, 2),
    ),
  );
});

test('a press that waited under 2000 ms still runs', async () => {
  const d = await slowFirstPress(1500);
  assert.deepEqual(
    d.focused().map((x) => x.args[0].block),
    ['b', 'c'],
  );
  assert.equal(d.key(0, 2).feedback, null);
});

test('presses without a timestamp are not treated as stale', async () => {
  const d = await deck(['a', 'b', 'c']);
  d.advanceClock(60000);
  await d.c.press(d.context(0, 1));
  assert.equal(d.focused().length, 1);
});

test('Attention is blank until another agent needs the user', async () => {
  const d = await deck(['a', 'b', 'c']);
  assert.equal(d.c.mapping(d.key(1, 4)), 'none');
  d.h.change('a', { state: 'blocked', kind: 'question' });
  await d.c.refresh();
  assert.equal(
    d.c.mapping(d.key(1, 4)),
    'none',
    'the selected agent is excluded',
  );
  d.h.change('b', { state: 'working' });
  await d.c.refresh();
  assert.equal(d.c.mapping(d.key(1, 4)), 'none');
});

test('Attention focuses a blocked agent in another bank and the bank follows', async () => {
  const blocks = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const state = { g: { state: 'blocked', kind: 'permission', statusAt: 'p1' } };
  const d = await deck(blocks, { state });
  assert.equal(d.c.getBank(), 0);
  assert.equal(d.c.mapping(d.key(1, 4)), 'attention');
  assert.equal(d.key(1, 4).presented.target.block, 'g');
  d.down(1, 4);
  await d.settle();
  assert.deepEqual(
    d.focused().map((x) => x.args[0].block),
    ['g'],
  );
  assert.equal(d.c.getBank(), 1);
  assert.equal(d.c.bridge.lastTarget.block, 'g');

  // The same call sequence an agent key makes for the same agent.
  const reference = await deck(blocks, { state });
  reference.c.setBank(1);
  reference.c.render();
  reference.down(0, 1);
  await reference.settle();
  assert.deepEqual(d.focused(), reference.focused());
  assert.deepEqual(d.h.calls, reference.h.calls);
});

test('Attention ranks blocked above error above done and excludes the selected agent', async () => {
  const d = await deck(['a', 'b', 'c', 'd'], {
    state: {
      b: { state: 'done', statusAt: 'x' },
      c: { state: 'error', statusAt: 'y' },
      d: { state: 'blocked', kind: 'question', statusAt: 'z' },
    },
  });
  assert.equal(d.key(1, 4).presented.target.block, 'd');
  d.h.change('d', { state: 'idle' });
  await d.c.refresh();
  assert.equal(d.key(1, 4).presented.target.block, 'c');
  d.h.change('c', { state: 'idle' });
  await d.c.refresh();
  assert.equal(d.key(1, 4).presented.target.block, 'b');
  d.h.change('a', { state: 'error' });
  await d.c.refresh();
  assert.equal(
    d.key(1, 4).presented.target.block,
    'b',
    'selected a never ranks',
  );
});

test('a stale Attention press sends zero input when the target changed or closed', async () => {
  for (const change of [
    (h) => h.change('c', { pid: 999 }),
    (h) => h.setLive(h.live.filter((a) => a.block !== 'c')),
  ]) {
    const d = await deck(['a', 'b', 'c'], {
      state: { c: { state: 'blocked', kind: 'question', statusAt: 'q' } },
    });
    const display = {
      ...d.key(1, 4).presented,
      pressedAt: 10500,
    };
    assert.equal(display.action, 'attention');
    change(d.h);
    d.h.calls.length = 0;
    await d.c.press(d.context(1, 4), display);
    assert.equal(d.h.calls.length, 0);
    assert(d.key(1, 4).feedback, 'refused with key feedback');
    assert.equal(d.c.bridge.lastTarget.block, 'a', 'focus did not move');
  }
});

test('Page from bank two of three distinguishes a 449 ms tap from a 450 ms hold', async () => {
  for (const hold of [false, true]) {
    const d = await deck(Array.from('abcdefghijk'));
    d.down(1, 1);
    d.up(1, 1);
    await d.settle();
    d.down(1, 1);
    d.timers.advance(449);
    await d.settle();
    assert.equal(d.c.getBank(), 1);
    if (hold) {
      d.timers.advance(1);
      await d.settle();
      assert.equal(d.c.getBank(), 0);
    }
    d.up(1, 1);
    await d.settle();
    assert.equal(d.c.getBank(), hold ? 0 : 2);
    assert.deepEqual(d.calls, []);
  }
});

test('a repeated press on a busy key animates a ring over its caption and delivers only the original action', async () => {
  const d = await deck();
  const original = d.c.bridge.focus.bind(d.c.bridge);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  d.c.bridge.focus = async (target) => {
    await gate;
    return original(target);
  };
  const image = () =>
    Buffer.from(d.key(0, 1).lastImage.split(',')[1], 'base64').toString();
  d.down(0, 1);
  d.up(0, 1);
  await new Promise(setImmediate);
  d.advanceClock(250);
  d.c.render();
  assert.match(image(), /id="busy-ring"/);
  assert.match(image(), />Chat b</);
  d.down(0, 1);
  d.up(0, 1);
  const first = image().match(/id="busy-ring" transform="([^"]+)"/)[1];
  d.advanceClock(250);
  d.c.render();
  assert.notEqual(
    image().match(/id="busy-ring" transform="([^"]+)"/)[1],
    first,
  );
  d.advanceClock(2500);
  release();
  await d.settle();
  assert.equal(d.focused().length, 1);
  assert.doesNotMatch(image(), /id="busy-ring"/);
  assert(!d.h.socket.frames.some((frame) => frame.event === 'showAlert'));
  d.down(0, 1);
  d.up(0, 1);
  await d.settle();
  assert.equal(d.focused().length, 2);
});
