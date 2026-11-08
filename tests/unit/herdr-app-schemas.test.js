const { test } = require('node:test');
const assert = require('node:assert/strict');
const boundary = require('../../src/schemas');
const f = require('../fixtures/backends/herdr-app/index.cjs');

const valid = {
  herdrAppRequest: { ls: true },
  herdrAppMessage: f.world,
  herdrAppWorld: f.world,
  herdrAppStatus: f.status,
  herdrAppCommands: f.commands,
  herdrCoreRequest: {
    jsonrpc: '2.0',
    id: 1,
    method: 'terminal.read',
    params: { terminal: 't1', lines: 0 },
  },
  herdrCoreMessage: { jsonrpc: '2.0', id: 1, result: f.hello },
  herdrCoreHello: f.hello,
  herdrCoreList: f.list,
  herdrCoreTerminal: f.list.terminals[0],
  herdrCoreStatus: f.coreStatus,
  herdrCoreRead: f.read,
};
for (const [name, value] of Object.entries(valid)) {
  test(`${name}: synthetic bounded wire data`, () => {
    assert.deepEqual(boundary.parse(name, JSON.stringify(value)), value);
    for (const input of ['undefined', '{"__proto__":{}}', 'x'.repeat(4000001)])
      assert.throws(() => boundary.parse(name, input));
    assert.throws(() =>
      boundary.validate(name, { ...value, ['bad\0key']: true }),
    );
  });
}
test('read requests exclude actions, caller attribution, history, remote aliases and input streams', () => {
  for (const value of [
    { ls: true, raise: true },
    { do: 'terminal.peek' },
    { ls: false },
    { status: true, args: {} },
  ])
    assert.throws(() => boundary.validate('herdrAppRequest', value));
  const request = (method, params) => ({
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });
  for (const value of [
    request('terminal.keys', { terminal: 't1', keys: ['enter'] }),
    request('terminal.send', { terminal: 't1', text: 'sample' }),
    request('terminal.interrupt', { terminal: 't1' }),
    request('server.stop', {}),
    request('terminal.attach', { terminal: 't1', observe: true }),
    request('hello', { generation: 1, framed: true }),
    request('hello', {
      generation: 1,
      framed: false,
      core: { id: 'peer', name: 'peer' },
    }),
    request('terminal.get', { terminal: 'cloud/t1' }),
    request('terminal.get', { terminal: 'alias' }),
    request('terminal.get', { terminal: 't01' }),
    request('terminal.get', { terminal: 't1', caller: 't2' }),
    request('terminal.read', { terminal: 't1', lines: 1 }),
    request('terminal.list', { all: true }),
  ])
    assert.throws(() => boundary.validate('herdrCoreRequest', value));
});
test('schema facts retain remote records without allowing remote process or input requests', () => {
  assert.deepEqual(
    boundary.validate('herdrCoreList', f.remoteList),
    f.remoteList,
  );
  assert.deepEqual(
    boundary.validate('herdrAppWorld', f.remoteWorld),
    f.remoteWorld,
  );
  assert.deepEqual(
    boundary.validate('herdrCoreHello', f.changedHello),
    f.changedHello,
  );
  assert.deepEqual(
    boundary.validate('herdrCoreHello', f.changedFeatures),
    f.changedFeatures,
  );
  for (const value of [f.malformed, { terminals: [], hidden_finished: -1 }])
    assert.throws(() => boundary.validate('herdrCoreList', value));
  for (const patch of [
    { generation: 2 },
    { framed: true },
    { version: 'bad\nversion' },
    { features: ['status', 'status'] },
    { methods: ['bad\0method'] },
  ])
    assert.throws(() =>
      boundary.validate('herdrCoreHello', { ...f.hello, ...patch }),
    );
  assert.throws(() =>
    boundary.validate('herdrCoreList', {
      ...f.list,
      terminals: Array(1001).fill(f.list.terminals[0]),
    }),
  );
  assert.throws(() =>
    boundary.validate('herdrAppWorld', {
      ...f.world,
      spaces: [{ ...f.world.spaces[0], id: 'bad\x1b' }],
    }),
  );
  assert.throws(() =>
    boundary.validate('herdrCoreRead', {
      ...f.read,
      text: 'x'.repeat(1000001),
    }),
  );
});
test('JSON-RPC responses have one matching result/error envelope, never a notification or ambiguous success', () => {
  for (const patch of [
    { id: '1', result: {} },
    { id: 1 },
    { id: 1, result: {}, error: { code: 1, message: 'sample' } },
    { method: 'event', params: {} },
    { id: 1, result: {}, jsonrpc: '1.0' },
  ])
    assert.throws(() =>
      boundary.validate('herdrCoreMessage', { jsonrpc: '2.0', ...patch }),
    );
  assert(
    boundary.validate('herdrCoreMessage', {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: 'sample' },
    }),
  );
});
