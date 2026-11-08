'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Bridge } = require('../../src/app/session');
test('focus', async () => {
  const calls = [];
  let fail = false;
  const run = async (args) => {
    calls.push(args);
    if (fail) throw Error('App action refused');
  };
  const activate = async () => calls.push(['activate']);
  const b = new Bridge({}, run, activate);
  b.client = async () => ({ client_id: 'app' });
  b.agent = async (t) => t;
  const t = { session: 's', window: 'w', block: 'b' };
  await b.focus(t);
  assert.deepEqual(
    calls.map((a) => a[0]),
    ['-C', 'focus', 'activate'],
  );
  assert(calls[0].includes('window_id=w'));
  calls.length = 0;
  await b.focus(t);
  assert.equal(calls.at(-1)[0], 'activate');
  b.config.bringToFront = false;
  calls.length = 0;
  await b.focus(t);
  assert.equal(calls.length, 2);
  b.config.bringToFront = true;
  fail = true;
  calls.length = 0;
  await assert.rejects(() => b.focus(t));
  assert.equal(calls.length, 1);
  console.log(
    'PASS exact selection before activation, repeat activation, opt-out, and no activation after failed selection',
  );
});
