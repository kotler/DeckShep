const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readRexApi } = require('../../src/terminals/rex/diagnostics');

test('API diagnostics enumerate one bounded non-autostarting read and discard private identity fields', async () => {
  const calls = [];
  const info = await readRexApi('/fixture/rex', async (...args) => {
    calls.push(args);
    return JSON.stringify({
      api_revision: 23,
      api_min_revision: 17,
      principal: { name: 'PRIVATE IDENTITY' },
      log_path: '/private/home/server.log',
      session: 'private-session',
    });
  });
  assert.deepEqual(info, { revision: 23, minimum: 17, legacy: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/fixture/rex');
  assert.deepEqual(calls[0][1], [
    '--autostart=false',
    '--timeout',
    '2s',
    'whoami',
    '--json',
  ]);
  assert.equal(calls[0][2].timeout, 2500);
  assert.equal(calls[0][2].maxBuffer, 16384);
  assert.deepEqual(calls[0][2].env, { REX_SERVER: '' });
  assert.equal(calls[0][2].input, undefined);
  assert(!JSON.stringify(info).includes('private'));
});

test('older revision reports default missing fields to zero without claiming control support', async () => {
  for (const [report, expected] of [
    [{}, { revision: 0, minimum: 0, legacy: true }],
    [{ api_revision: 9 }, { revision: 9, minimum: 0, legacy: true }],
    [
      { api_revision: 0, api_min_revision: 0 },
      { revision: 0, minimum: 0, legacy: false },
    ],
  ]) {
    assert.deepEqual(
      await readRexApi('/fixture/rex', async () => JSON.stringify(report)),
      expected,
    );
  }
});

test('malformed, impossible, oversized and failed API reads refuse privately with no retry', async () => {
  for (const output of [
    'not-json',
    'null',
    '[]',
    'true',
    '"PRIVATE"',
    '{"api_revision":"23"}',
    '{"api_revision":null}',
    '{"api_revision":-1}',
    '{"api_revision":1.5}',
    '{"api_revision":9007199254740992}',
    '{"api_revision":4,"api_min_revision":5}',
    '{"api_min_revision":-1}',
    '{"constructor":{}}',
    JSON.stringify({ api_revision: 1, private: '界'.repeat(6000) }),
  ]) {
    let calls = 0;
    await assert.rejects(
      () =>
        readRexApi('/fixture/rex', async () => {
          calls++;
          return output;
        }),
      { message: 'Rex API diagnostics unavailable' },
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    () =>
      readRexApi('/fixture/rex', async () => {
        calls++;
        throw Error('PRIVATE /home/secret token');
      }),
    { message: 'Rex API diagnostics unavailable' },
  );
  assert.equal(calls, 1);
});
