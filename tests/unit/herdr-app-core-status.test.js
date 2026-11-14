const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  AppCoreStatusReader,
} = require('../../src/terminals/herdr-app/core-status');
const f = require('../fixtures/backends/herdr-app/index.cjs');

function fakeCore(terminals, overrides = {}) {
  const calls = [];
  let pid = 7,
    uptime = 10;
  const client = {
    info: null,
    generation: 1,
    async connect() {
      calls.push('hello');
      client.info = { core: { id: 'core-a' } };
    },
    async status() {
      calls.push('status');
      uptime += 1;
      return {
        pid: overrides.pidAfter && calls.length > 3 ? 8 : pid,
        uptime_ms: uptime,
      };
    },
    async list() {
      calls.push('list');
      if (overrides.hang) await new Promise(() => {});
      return { terminals };
    },
    close() {
      calls.push('close');
      client.info = null;
      client.generation++;
    },
  };
  return { client, calls };
}
const live = (address, status, extra = {}) => ({
  ...structuredClone(f.list.terminals[0]),
  address,
  status,
  ...extra,
});
test('core reader brackets one listing with status reads and keeps only live local labels', async () => {
  const { client, calls } = fakeCore([
    live('t1', {
      state: 'working',
      app: 'codex',
      title: 'Fix the build',
      kind: null,
    }),
    live('m1/t2', { state: 'idle' }),
    live('t3', null, { state: 'finished' }),
  ]);
  const snapshot = await new AppCoreStatusReader(client).read();
  assert.deepEqual(calls, ['hello', 'status', 'list', 'status']);
  assert.equal(snapshot.provenance, 'core-listing');
  assert.deepEqual(
    snapshot.terminals.map((facts) => [facts.address, facts.statusTitle]),
    [['t1', 'Fix the build']],
  );
  assert(!Object.hasOwn(snapshot.terminals[0], 'pid'));
});
test('core reader refuses restarted cores, duplicate addresses and expired budgets', async () => {
  const restarted = fakeCore([live('t1', { state: 'idle' })], {
    pidAfter: true,
  });
  await assert.rejects(
    new AppCoreStatusReader(restarted.client).read(),
    /changed/,
  );
  assert.equal(restarted.calls.at(-1), 'close');
  const duplicate = fakeCore([live('t1', null), live('t1', null)]);
  await assert.rejects(
    new AppCoreStatusReader(duplicate.client).read(),
    /ambiguous/,
  );
  const hung = fakeCore([], { hang: true });
  await assert.rejects(
    new AppCoreStatusReader(hung.client, 20).read(),
    /expired/,
  );
  assert.throws(() => new AppCoreStatusReader(hung.client, 5000), /limit/);
});
