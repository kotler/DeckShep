'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');
const real = require('../../src/render/visuals');

function counting() {
  const renderer = {
    drawn: 0,
    svg: (spec) => (renderer.drawn++, real.svg(spec)),
    pulse: real.pulse,
  };
  return renderer;
}

test('unchanged ticks build no SVG, encode nothing and send no frames', async () => {
  const renderer = counting();
  const h = harness({ renderer });
  await h.ready();
  const settled = h.socket.frames.length;
  assert(settled >= 15, 'first render sent a frame for every key');
  assert.equal(
    h.socket.frames.filter((f) => f.event === 'setTitle').length,
    15,
    'one empty title per key appearance',
  );
  const drawn = renderer.drawn;
  const before = new Map([...h.api.keys].map(([ctx, k]) => [ctx, k.presented]));
  for (let i = 0; i < 5; i++) {
    h.tick(250);
    h.api.render();
  }
  assert.equal(renderer.drawn, drawn, 'SVG builder not called');
  assert.equal(h.socket.frames.length, settled, 'no frames sent');
  for (const [ctx, k] of h.api.keys)
    assert.notEqual(k.presented, before.get(ctx), 'presented refreshed ' + ctx);
});

test('a state change redraws only the keys whose face changed', async () => {
  const renderer = counting();
  const h = harness({ renderer });
  await h.ready();
  await h.api.refresh();
  const settled = h.socket.frames.length;
  h.change('b', { state: 'done', statusAt: 'v2' });
  await h.api.refresh();
  const sent = h.socket.frames.slice(settled);
  assert.deepEqual(
    sent.filter((f) => f.event === 'setImage').map((f) => f.context),
    // Key 1,4 is Attention: the finished agent b now needs the user.
    ['0,1', '1,4'],
  );
  assert(!sent.some((f) => f.event === 'setTitle'), 'title not repeated');
  assert(renderer.drawn >= 1);
  const drawn = renderer.drawn;
  h.api.render();
  assert.equal(renderer.drawn, drawn);
});

test('clearing lastImage forces the key to be sent again', async () => {
  const h = harness({ renderer: counting() });
  await h.ready();
  const key = h.api.keys.get('1,1');
  const settled = h.socket.frames.length;
  key.lastImage = undefined;
  h.api.render();
  const sent = h.socket.frames.slice(settled);
  assert.deepEqual(
    sent.map((f) => f.event + ':' + f.context),
    ['setImage:1,1', 'setTitle:1,1'],
  );
});
