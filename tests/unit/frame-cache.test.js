'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { createFrameCache } = require('../../src/render/frame');
const spec = (over = {}) => ({
  icon: 'model',
  lines: ['Model', 'gpt'],
  color: '#233a50',
  pulse: 0,
  badge: '',
  accent: '#b16bf2',
  style: 'signal',
  textOnly: false,
  agent: false,
  ...over,
});
const decode = (uri) =>
  Buffer.from(uri.split(',')[1], 'base64').toString('utf8');

test('frame cache: identical specs share one drawing and one string', () => {
  const calls = [];
  const cache = createFrameCache((s) => (calls.push(s), '<svg>' + s.color));
  const a = cache.image(spec());
  const b = cache.image(spec());
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  assert.match(a, /^data:image\/svg\+xml;base64,/);
  assert.equal(decode(a), '<svg>#233a50');
});

test('frame cache: a changed field draws again', () => {
  let n = 0;
  const cache = createFrameCache(() => '<svg>' + ++n);
  const first = cache.image(spec());
  for (const over of [
    { lines: ['Model', 'other'] },
    { color: '#000000' },
    { pulse: 0.02 },
    { badge: 'selected' },
    { hold: true },
  ])
    assert.notEqual(cache.image(spec(over)), first);
  assert.equal(n, 6);
});

test('frame cache: key ignores property order and undefined fields', () => {
  const cache = createFrameCache(() => '');
  const a = spec();
  const reversed = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(cache.key(a), cache.key(reversed));
  assert.equal(cache.key(a), cache.key({ ...a, state: undefined }));
  assert.notEqual(cache.key(a), cache.key({ ...a, state: 'ready' }));
});

test('frame cache: evicts the least recently used entry past capacity', () => {
  let n = 0;
  const cache = createFrameCache(() => '<svg>' + ++n, 2);
  const a = spec({ color: '#000001' }),
    b = spec({ color: '#000002' }),
    c = spec({ color: '#000003' });
  cache.image(a);
  cache.image(b);
  cache.image(a); // a is now newer than b
  cache.image(c); // evicts b
  assert.equal(n, 3);
  cache.image(a);
  assert.equal(n, 3, 'a survived');
  cache.image(b);
  assert.equal(n, 4, 'b was evicted and redrawn');
});
