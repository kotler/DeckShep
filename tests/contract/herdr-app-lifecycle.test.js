const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  HerdrAppClient,
  HerdrCoreClient,
} = require('../../src/terminals/herdr-app/transport');
const { ReadOnlyLines } = require('../../src/terminals/herdr-app/line-client');
const { appSocket } = require('../../src/terminals/herdr-app/endpoint');
const {
  fakeServer,
  respond,
  coreReply,
} = require('../helpers/herdr-app-server');
const f = require('../fixtures/backends/herdr-app/index.cjs');

for (const [name, makeReply] of [
  [
    'wrong response ID',
    (request) => ({ jsonrpc: '2.0', id: request.id + 1, result: f.list }),
  ],
  [
    'upstream error',
    (request) => ({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32000, message: 'PRIVATE_PAYLOAD' },
    }),
  ],
  [
    'ambiguous response',
    (request) => ({
      jsonrpc: '2.0',
      id: request.id,
      result: f.list,
      error: { code: 1, message: 'sample' },
    }),
  ],
  [
    'missing facts',
    (request) => ({ jsonrpc: '2.0', id: request.id, result: f.malformed }),
  ],
])
  test(`core ${name} closes the connection before a queued request can be sent`, async (t) => {
    const peer = await fakeServer(t, (socket, request) => {
      if (request.method === 'hello') return coreReply(socket, request);
      socket.write(JSON.stringify(makeReply(request)) + '\n');
    });
    const client = new HerdrCoreClient(peer.file);
    t.after(() => client.close());
    await client.connect();
    const generation = client.generation;
    const first = client.list(),
      second = client.get('t1');
    await assert.rejects(
      first,
      (error) => !/PRIVATE_PAYLOAD|sample-core/.test(error.message),
    );
    await assert.rejects(second, /changed/);
    assert.equal(client.info, null);
    assert(client.generation > generation);
    assert.deepEqual(
      peer.calls.map((call) => call.method),
      ['hello', 'terminal.list'],
    );
  });

for (const patch of [
  { complete: false },
  { how: 'stitched' },
  { how: 'history' },
])
  test(`passive view refuses ${JSON.stringify(patch)} without history/attach fallback`, async (t) => {
    const peer = await fakeServer(t, (socket, request) =>
      request.method === 'terminal.read'
        ? respond(socket, request, { ...f.read, ...patch })
        : coreReply(socket, request),
    );
    const client = new HerdrCoreClient(peer.file);
    t.after(() => client.close());
    await client.connect();
    await assert.rejects(client.readPane('t1'), /incomplete/);
    assert.deepEqual(
      peer.calls.map((call) => call.method),
      ['hello', 'terminal.read'],
    );
  });

test('disposal, reconnect and abort cancel pending reads and keep old work off a new connection', async (t) => {
  let notify = () => {};
  const peer = await fakeServer(t, (socket, request) => {
    if (request.method === 'terminal.list') notify();
    else coreReply(socket, request);
  });
  const client = new HerdrCoreClient(peer.file);
  t.after(() => client.close());
  const abort = new AbortController();
  await client.connect(abort.signal);
  let received = new Promise((resolve) => {
    notify = resolve;
  });
  const first = client.list();
  await received;
  const queued = client.get('t1');
  const reconnect = client.connect();
  await assert.rejects(first, /closed/);
  await assert.rejects(queued, /changed/);
  await reconnect;
  abort.abort(); // An old signal cannot close the new connection.
  assert.deepEqual(await client.get('t1'), f.list.terminals[0]);
  received = new Promise((resolve) => {
    notify = resolve;
  });
  const next = client.list();
  await received;
  client.close();
  await assert.rejects(next, /closed/);
  assert.equal(
    peer.calls.filter((call) => call.method === 'terminal.list').length,
    2,
  );
});

test('App disposal cancels an active read and replacement invalidates its endpoint generation', async (t) => {
  let notify,
    silent = true;
  const received = new Promise((resolve) => {
    notify = resolve;
  });
  const peer = await fakeServer(
    t,
    (socket) => {
      notify();
      if (!silent) socket.end(JSON.stringify(f.world) + '\n');
    },
    'herdr-app.sock',
  );
  const disposed = new HerdrAppClient({ appHome: peer.directory });
  const pending = disposed.ls();
  await received;
  disposed.dispose();
  await assert.rejects(pending, /closed/);
  silent = false;
  const client = new HerdrAppClient({ appHome: peer.directory });
  t.after(() => client.dispose());
  await client.ls();
  const generation = client.generation;
  fs.renameSync(peer.file, path.join(peer.directory, 'previous.sock'));
  for (const socket of peer.clients) socket.destroy();
  await new Promise((resolve) => peer.server.close(resolve));
  await new Promise((resolve) => peer.server.listen(peer.file, resolve));
  fs.chmodSync(peer.file, 0o600);
  await client.ls();
  assert(client.generation > generation);
});

test('a low-level read stays single-flight; endpoint changes and peer disconnects refuse without replay', async (t) => {
  let notify;
  const received = new Promise((resolve) => {
    notify = resolve;
  });
  const peer = await fakeServer(t, () => notify(), 'herdr-app.sock');
  const connection = new ReadOnlyLines(peer.file, 'app');
  t.after(() => connection.close());
  await connection.open();
  await assert.rejects(connection.open(), /closed/);
  const pending = connection.request({ ls: true });
  await received;
  await assert.rejects(connection.request({ status: true }), /pending/);
  for (const socket of peer.clients) socket.destroy();
  await assert.rejects(pending, /closed/);
  await assert.rejects(connection.request({ ls: true }), /closed/);
  assert.equal(peer.calls.length, 1);
  const next = new ReadOnlyLines(peer.file, 'app');
  t.after(() => next.close());
  await next.open();
  fs.renameSync(peer.file, path.join(peer.directory, 'replaced.sock'));
  await assert.rejects(next.request({ ls: true }), /changed/);
  assert.equal(peer.calls.length, 1);
});

test('unsupported limits, absent servers and cancelled handshakes fail privately', async (t) => {
  assert(path.isAbsolute(appSocket())); // Resolution only; no filesystem probe.
  for (const options of [
    { timeoutMs: 0 },
    { timeoutMs: 60001 },
    { timeoutMs: NaN },
    { maxBytes: 15 },
    { maxBytes: 4000001 },
  ])
    assert.throws(() => new ReadOnlyLines('/sample', 'app', options), /limits/);
  const peer = await fakeServer(t, coreReply);
  fs.renameSync(peer.file, path.join(peer.directory, 'not-listening.sock'));
  fs.writeFileSync(peer.file, '', { mode: 0o600 });
  await assert.rejects(
    new HerdrCoreClient(peer.file).connect(),
    (error) => !error.message.includes(peer.directory),
  );
  const connection = new ReadOnlyLines(peer.file, 'app');
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(connection.open(aborted.signal), /cancelled/);
  await assert.rejects(connection.request({ ls: true }), /closed/);
  connection.close();
});
