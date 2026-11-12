const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');

test('manual Rex selection, a shell, and closing the active tab move or clear the dot without input', async () => {
  const h = harness({ fixtureConsent: true });
  const dots = () =>
    Array.from({ length: 5 }, (_, column) => column).filter((column) =>
      h.image(0, column).includes('id="selected-agent"'),
    );
  await h.api.refresh();
  assert.deepEqual(dots(), [0]);
  h.native('b');
  await h.api.refresh();
  assert.deepEqual(dots(), [1]);
  const stale = h.api.keys.get('2,0').presented;
  h.native('shell');
  await h.api.refresh();
  assert.deepEqual(dots(), []);
  assert.equal(h.api.bridge.lastTarget, null);
  for (let column = 0; column < 5; column++) {
    assert.equal(h.api.keys.get('2,' + column).presented.action, 'none');
    await h.press(2, column);
  }
  h.native('a');
  h.setLive(h.live.filter((agent) => agent.block !== 'b'));
  await h.api.refresh();
  assert.deepEqual(dots(), [0]);
  h.tick();
  await h.press(2, 0, stale);
  assert.deepEqual(h.calls, []);
});

test('background arrivals never steal selection; manual focus follows the visible bank and PID', async () => {
  const h = harness({ fixtureConsent: true });
  await h.api.refresh();
  const agents = Array.from({ length: 6 }, (_, i) => ({
    ...h.live[0],
    block: 'p' + i,
    pid: 100 + i,
  }));
  h.setLive([...h.live, ...agents]);
  await h.api.refresh();
  assert.equal(h.api.bridge.lastTarget.block, 'a');
  h.native('p5');
  await h.api.refresh();
  assert.equal(h.api.getBank(), 1);
  assert.equal(h.api.bridge.lastNavigationTarget.block, 'p5');
  assert(h.image(0, 2).includes('id="selected-agent"'));
  h.change('p5', { pid: 200 });
  await h.api.refresh();
  assert.equal(h.api.bridge.lastNavigationTarget.pid, 200);
  h.setLive(h.live.filter((agent) => agent.block !== 'p5'));
  h.native('b');
  await h.api.refresh();
  assert.equal(h.api.getBank(), 0);
  assert(h.image(0, 1).includes('id="selected-agent"'));
  assert.deepEqual(h.calls, []);
});
