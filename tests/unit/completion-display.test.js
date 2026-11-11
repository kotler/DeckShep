'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  { harness } = require('../helpers/plugin-harness');
test('completion display', async () => {
  const h = harness({ fixtureConsent: true });
  await h.ready();
  assert(h.image(0, 2).includes('>No agent<'));
  assert(!h.image(0, 2).includes('>IDLE<'));
  h.change('a', { state: 'done', statusAt: 'complete-1' });
  h.change('b', { state: 'done', statusAt: 'other-1' });
  await h.api.refresh();
  assert(h.image(0, 0).includes('>COMPLETE<'));
  assert(h.image(0, 1).includes('>COMPLETE<'));
  h.tick(1999);
  h.api.render();
  assert(h.image(0, 0).includes('>COMPLETE<'));
  h.tick(1);
  h.api.render();
  assert(h.image(0, 0).includes('>READY<'));
  assert(h.image(0, 0).includes('id="selected-agent"'));
  assert(h.image(0, 1).includes('>COMPLETE<'));
  assert.equal(
    h.api.bridge.agents[0].state,
    'done',
    'display acknowledgement must preserve native status',
  );
  assert.equal(h.calls.length, 0, 'acknowledgement sends no native controls');
  // Acknowledged results remain Ready across rediscovery and selection changes.
  await h.press(0, 1);
  assert(h.image(0, 0).includes('>READY<'));
  h.tick(1000);
  h.api.render();
  assert(h.image(0, 1).includes('>COMPLETE<'));
  await h.press(0, 0);
  h.tick(3000);
  h.api.render();
  await h.press(0, 1);
  h.tick(1999);
  h.api.render();
  assert(h.image(0, 1).includes('>COMPLETE<'), 'dwell must be continuous');
  h.tick(1);
  h.api.render();
  assert(h.image(0, 1).includes('>READY<'));
  // A new completion must reappear even if the intermediate working poll was missed.
  h.change('b', { statusAt: 'other-2' });
  await h.api.refresh();
  assert(h.image(0, 1).includes('>COMPLETE<'));
  h.tick(2000);
  h.api.render();
  assert(h.image(0, 1).includes('>READY<'));
  h.change('b', { state: 'working', statusAt: 'run' });
  await h.api.refresh();
  assert(h.image(0, 1).includes('>WORKING<'));
  h.change('b', { state: 'done', statusAt: 'other-2' });
  await h.api.refresh();
  assert(h.image(0, 1).includes('>COMPLETE<'));
  h.tick(2000);
  h.api.render();
  h.setLive(h.live.filter((a) => a.block !== 'b'));
  await h.api.refresh();
  assert(h.image(0, 1).includes('>Closed<'));
  assert(!h.image(0, 1).includes('>IDLE<'));
  h.setLive([
    ...h.live,
    {
      session: 's',
      block: 'b',
      pid: 99,
      app: 'codex',
      state: 'done',
      statusAt: 'other-2',
      chatName: 'Replacement',
      project: 'project',
    },
  ]);
  await h.api.refresh();
  assert(
    h.image(0, 1).includes('>COMPLETE<'),
    'replacement cannot inherit acknowledgement',
  );
  console.log(
    'PASS empty slot labels, selected completion dwell, deselection, fresh completions, process replacement and native state isolation',
  );
});
