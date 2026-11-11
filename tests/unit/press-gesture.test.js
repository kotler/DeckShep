'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { createPressGestures, HOLD_MS } = require('../../src/app/press-gesture');

function fakeTimers() {
  let now = 0,
    next = 1;
  const pending = new Map();
  return {
    ports: {
      setTimeout(fn, ms) {
        const id = next++;
        pending.set(id, { fn, at: now + ms });
        return id;
      },
      clearTimeout(id) {
        pending.delete(id);
      },
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...pending])
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
    },
    get pending() {
      return pending.size;
    },
  };
}

test('hold threshold is 450 ms', () => assert.equal(HOLD_MS, 450));

test('a key without a hold action taps on key down, with no timer', () => {
  const t = fakeTimers(),
    g = createPressGestures(t.ports),
    fired = [];
  assert.equal(
    g.down('k', false, (kind) => fired.push(kind)),
    false,
  );
  assert.deepEqual(fired, ['tap']);
  assert.equal(t.pending, 0);
  g.up('k');
  assert.deepEqual(fired, ['tap'], 'key up adds nothing');
});

test('a key with a hold action taps on key up before 450 ms', () => {
  const t = fakeTimers(),
    g = createPressGestures(t.ports),
    fired = [];
  assert.equal(
    g.down('k', true, (kind) => fired.push(kind)),
    true,
  );
  t.advance(HOLD_MS - 1);
  assert.deepEqual(fired, []);
  g.up('k');
  assert.deepEqual(fired, ['tap']);
  assert.equal(t.pending, 0, 'timer cleared');
  t.advance(1000);
  assert.deepEqual(fired, ['tap']);
});

test('the hold fires at 450 ms and the later key up fires no tap', () => {
  const t = fakeTimers(),
    g = createPressGestures(t.ports),
    fired = [];
  g.down('k', true, (kind) => fired.push(kind));
  t.advance(HOLD_MS);
  assert.deepEqual(fired, ['hold']);
  g.up('k');
  t.advance(5000);
  assert.deepEqual(fired, ['hold']);
});

test('cancel drops the gesture without firing', () => {
  const t = fakeTimers(),
    g = createPressGestures(t.ports),
    fired = [];
  g.down('k', true, (kind) => fired.push(kind));
  g.cancel('k');
  t.advance(5000);
  g.up('k');
  assert.deepEqual(fired, []);
  assert.equal(t.pending, 0);
});

test('a stray key up is ignored', () => {
  const t = fakeTimers(),
    g = createPressGestures(t.ports);
  assert.doesNotThrow(() => g.up('nothing'));
  assert.doesNotThrow(() => g.cancel('nothing'));
});

test('a repeated key down without a key up fires nothing for the lost press', () => {
  const t = fakeTimers(),
    g = createPressGestures(t.ports),
    first = [],
    second = [];
  g.down('k', true, (kind) => first.push(kind));
  g.down('k', true, (kind) => second.push(kind));
  t.advance(HOLD_MS);
  assert.deepEqual(first, []);
  assert.deepEqual(second, ['hold']);
});

test('two keys held at once are independent', () => {
  const t = fakeTimers(),
    g = createPressGestures(t.ports),
    fired = [];
  g.down('a', true, (kind) => fired.push('a:' + kind));
  t.advance(200);
  g.down('b', true, (kind) => fired.push('b:' + kind));
  t.advance(250); // a reaches 450, b is at 250
  assert.deepEqual(fired, ['a:hold']);
  g.up('b');
  assert.deepEqual(fired, ['a:hold', 'b:tap']);
  g.up('a');
  t.advance(1000);
  assert.deepEqual(fired, ['a:hold', 'b:tap']);
});
