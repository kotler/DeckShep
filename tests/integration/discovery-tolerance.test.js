'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RexTransport } = require('../../src/terminals/rex/transport');
const { harness } = require('../helpers/plugin-harness');

const timeout = () =>
  Object.assign(Error('Rex command failed'), { code: 'REX_TIMEOUT' });

test('only a timed-out Rex call is marked as momentary', async () => {
  let kind = 'timeout';
  const transport = new RexTransport(() => ({ rexPath: '' }), {
    directory: '/fixture/plugin',
    now: () => 0,
    discover: async () => ({
      binary: '/fixture/Rex.app/rex',
      application: '/fixture/Rex.app',
    }),
    execute: async (_file, _args, options) => {
      options.onFailure({ kind, exitCode: null });
      throw Error(options.message);
    },
  });
  const failure = async () =>
    transport.command(['ls', '--json']).then(assert.fail, (error) => error);
  assert.equal((await failure()).code, 'REX_TIMEOUT');
  assert.equal((await failure()).message, 'Rex command failed');
  for (kind of ['connection-refused', 'missing-executable', 'exit', 'other']) {
    const error = await failure();
    assert.equal(error.code, undefined, kind);
    assert.equal(error.message, 'Rex command failed');
  }
});

test('one timed-out discovery keeps the agent row; a second shows offline', async () => {
  const h = harness();
  await h.ready();
  const shown = () => [h.image(0, 0), h.image(0, 1)];
  const before = shown();
  assert(before[0].includes('Chat a'));
  // The harness discovery leaves the navigation list alone; real discovery
  // refills it, which matters after the offline path has emptied it.
  const fixture = h.api.bridge.discover.bind(h.api.bridge);
  const discover = async () => {
    const agents = await fixture();
    h.api.bridge.navigationAgents = undefined;
    return agents;
  };
  let failure = timeout;
  h.api.bridge.discover = async () => {
    throw failure();
  };
  await h.api.refresh();
  assert.deepEqual(shown(), before, 'the row is unchanged after one miss');
  assert.equal(h.api.bridge.agents.length, 2);
  await h.api.refresh();
  assert(h.image(0, 0).includes('Rex offline'));
  assert.equal(h.api.bridge.agents.length, 0);
  // Recovery, then a miss, then recovery: the counter starts again.
  h.api.bridge.discover = discover;
  await h.api.refresh();
  assert(h.image(0, 0).includes('Chat a'));
  h.api.bridge.discover = async () => {
    throw failure();
  };
  await h.api.refresh();
  assert(h.image(0, 0).includes('Chat a'));
  h.api.bridge.discover = discover;
  await h.api.refresh();
  h.api.bridge.discover = async () => {
    throw failure();
  };
  await h.api.refresh();
  assert(h.image(0, 0).includes('Chat a'), 'a later single miss is tolerated');
  // Any failure that is not a timeout shows offline at once.
  h.api.bridge.discover = discover;
  await h.api.refresh();
  failure = () => Error('Rex command failed');
  h.api.bridge.discover = async () => {
    throw failure();
  };
  await h.api.refresh();
  assert(h.image(0, 0).includes('Rex offline'));
});

test('a press during the tolerated miss sends nothing when Rex does not answer', async () => {
  const h = harness();
  await h.ready();
  h.api.bridge.discover = async () => {
    throw timeout();
  };
  await h.api.refresh();
  assert(h.image(0, 0).includes('Chat a'));
  // The key still shows the agent, but its own fresh read fails.
  h.api.bridge.select = async () => {
    throw timeout();
  };
  h.api.bridge.checked = async () => {
    throw timeout();
  };
  const sent = h.calls.length;
  await h.press(0, 1);
  assert.equal(h.calls.length, sent);
});

test('discovery passes the timeout mark through unchanged', async () => {
  const { Bridge } = require('../../src/app/session');
  const bridge = new Bridge({ backend: 'rex' }, async () => {
    throw timeout();
  });
  await assert.rejects(bridge.discover(), { code: 'REX_TIMEOUT' });
});
