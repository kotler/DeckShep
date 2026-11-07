'use strict';
const assert = require('node:assert/strict');
const { Setup } = require('../../com.local.rexagents.sdPlugin/setup-presets');
(async () => {
  const calls = [];
  const b = {
    method: async () => ({ rows: 2 }),
    run: async (args) => {
      calls.push(args);
      return {
        content:
          'Presets\nStart preset from current settings\nCURRENT VIEW\nnot a dialog\n',
      };
    },
  };
  const s = new Setup(b);
  const viewport = await s.screen({ session: 's', block: 'b' });
  assert.equal(viewport, 'CURRENT VIEW\nnot a dialog');
  assert(!viewport.includes('Presets'));
  assert(calls[0].at(-1).includes('"trim":false'));
  b.run = async () => ({ id: 2, content: 'truncated' });
  await assert.rejects(() => s.screen({ session: 's', block: 'b' }));
  const keys = [];
  const guarded = new Setup({ checked: async () => {}, run: async () => {} });
  guarded.menu = async () => {};
  guarded.key = async (a, ...k) => keys.push(k);
  let waits = 0;
  guarded.wait = async (a, predicate) => {
    const screens = [
      'Start preset from current settings',
      'New preset',
      'New preset\n› /statusline thread-idu',
    ];
    if (!predicate(screens[waits++])) throw Error('Preset field did not match');
  };
  await assert.rejects(() => guarded.store({}, '0', '/statusline thread-id'));
  assert.deepEqual(keys, [['s'], ['enter'], ['end', 'ctrl+u']]);
  console.log(
    'PASS viewport-only dialog checks, truncated data rejection, and malformed preset-field refusal before saving',
  );
})();
