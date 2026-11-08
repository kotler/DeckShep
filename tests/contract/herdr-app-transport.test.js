const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  HerdrAppClient,
  HerdrCoreClient,
} = require('../../src/terminals/herdr-app/transport');
const { ReadOnlyLines } = require('../../src/terminals/herdr-app/line-client');
const {
  appSocket,
  inspectSocket,
} = require('../../src/terminals/herdr-app/endpoint');
const {
  fakeServer,
  respond,
  coreReply,
} = require('../helpers/herdr-app-server');
const f = require('../fixtures/backends/herdr-app/index.cjs');

test('App home resolution is passive, explicit, private and never falls back after an invalid override', () => {
  const home = path.resolve('/sample');
  assert.equal(
    appSocket({ env: {}, home }),
    path.join(home, '.config/herdr-app/herdr-app.sock'),
  );
  assert.equal(
    appSocket({ env: { XDG_CONFIG_HOME: home } }),
    path.join(home, 'herdr-app/herdr-app.sock'),
  );
  assert.equal(
    appSocket({ env: { HERDR_APP_HOME: home } }),
    path.join(home, 'herdr-app.sock'),
  );
  assert.equal(
    appSocket({ appHome: home, env: { HERDR_APP_HOME: '/other' } }),
    path.join(home, 'herdr-app.sock'),
  );
  for (const appHome of ['', 'relative', '/sample\nprivate'])
    assert.throws(
      () => appSocket({ appHome, env: {} }),
      (error) => !error.message.includes('private'),
    );
  assert.throws(() => appSocket({ env: { HERDR_APP_HOME: '' }, home }));
  assert.throws(() => appSocket({ env: { XDG_CONFIG_HOME: '' }, home }));
});

test('App client uses exactly one connection/request per read and exposes no mutation route', async (t) => {
  const peer = await fakeServer(
    t,
    (socket, request) => {
      const value = request.ls
        ? f.world
        : request.status
          ? f.status
          : f.commands;
      socket.end(JSON.stringify(value) + '\n');
    },
    'herdr-app.sock',
  );
  const client = new HerdrAppClient({ appHome: peer.directory });
  t.after(() => client.dispose());
  assert.deepEqual(await client.ls(), f.world);
  const generation = client.generation;
  assert.deepEqual(await client.status(), f.status);
  assert.deepEqual(await client.commands(), f.commands);
  assert.equal(client.generation, generation);
  assert.deepEqual(peer.calls, [
    { ls: true },
    { status: true },
    { commands: true },
  ]);
  assert.equal(client.deliver, undefined);
  assert.equal(client.focus, undefined);
  client.dispose();
  await assert.rejects(client.ls(), /disposed/);
});

test('core plain handshake, serialized reads and split UTF-8 retain exact IDs and request scope', async (t) => {
  const peer = await fakeServer(t, (socket, request) => {
    if (request.method !== 'terminal.read') return coreReply(socket, request);
    const bytes = Buffer.from(
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result: f.read }) + '\n',
    );
    const split = bytes.indexOf(Buffer.from('測')) + 1;
    socket.write(bytes.subarray(0, split));
    setImmediate(() => socket.write(bytes.subarray(split)));
  });
  const client = new HerdrCoreClient(peer.file);
  t.after(() => client.close());
  assert.deepEqual(await client.connect(), f.hello);
  const info = client.info;
  info.features.push('not-real');
  assert(!client.info.features.includes('not-real'));
  const [list, terminal, status, view] = await Promise.all([
    client.list(),
    client.get('t1'),
    client.status(),
    client.readPane('t1'),
  ]);
  assert.deepEqual(
    [list, terminal, status, view],
    [f.list, f.list.terminals[0], f.coreStatus, f.read],
  );
  assert.deepEqual(peer.calls, [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'hello',
      params: { generation: 1, framed: false },
    },
    { jsonrpc: '2.0', id: 2, method: 'terminal.list', params: { all: false } },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'terminal.get',
      params: { terminal: 't1' },
    },
    { jsonrpc: '2.0', id: 4, method: 'server.status', params: {} },
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'terminal.read',
      params: { terminal: 't1', lines: 0 },
    },
  ]);
  const before = peer.calls.length;
  await assert.rejects(client.get('cloud/t1'));
  await assert.rejects(client.readPane('alias'));
  assert.equal(peer.calls.length, before);
  assert.equal(client.send, undefined);
  client.close();
  await assert.rejects(client.list(), /changed/);
});

test('even the socket writer refuses unguarded mutations before any connection', async () => {
  for (const protocol of ['app', 'core']) {
    const connection = new ReadOnlyLines('/unavailable-private-path', protocol);
    const payloads =
      protocol === 'app'
        ? [
            { raise: true },
            { do: 'pane.zoom', args: { pane: 'p1' } },
            { do: 'terminal.peek' },
          ]
        : [
            'terminal.keys',
            'terminal.send',
            'terminal.attach',
            'server.stop',
          ].map((method) => ({ jsonrpc: '2.0', id: 1, method, params: {} }));
    for (const payload of payloads)
      await assert.rejects(
        connection.request(payload),
        (error) => !error.message.includes('unavailable-private-path'),
      );
    connection.close();
  }
});

test('endpoint checks reject public permissions, regular files, wrong owner and ancestor/socket links', async (t) => {
  const peer = await fakeServer(t, coreReply);
  assert(inspectSocket(peer.file).identity);
  fs.chmodSync(peer.file, 0o666);
  assert.throws(() => inspectSocket(peer.file), /Unsafe/);
  fs.chmodSync(peer.file, 0o600);
  fs.chmodSync(peer.directory, 0o755);
  assert.throws(() => inspectSocket(peer.file), /Unsafe/);
  fs.chmodSync(peer.directory, 0o700);
  fs.symlinkSync(peer.file, path.join(peer.directory, 'alias.sock'));
  assert.throws(
    () => inspectSocket(path.join(peer.directory, 'alias.sock')),
    /Unsafe/,
  );
  fs.symlinkSync(peer.directory, path.join(peer.directory, 'alias'));
  assert.throws(
    () =>
      inspectSocket(
        path.join(peer.directory, 'alias', path.basename(peer.file)),
      ),
    /Unsafe/,
  );
  fs.writeFileSync(path.join(peer.directory, 'regular'), 'sample');
  assert.throws(
    () => inspectSocket(path.join(peer.directory, 'regular')),
    /Unsafe/,
  );
  assert.throws(
    () => inspectSocket(path.join(peer.directory, 'missing')),
    (error) => !error.message.includes(peer.directory),
  );
  const lstat = fs.lstatSync;
  try {
    fs.lstatSync = (file) => {
      const stat = lstat(file);
      if (file === peer.file)
        Object.defineProperty(stat, 'uid', { value: stat.uid + 1 });
      return stat;
    };
    assert.throws(() => inspectSocket(peer.file), /Unsafe/);
  } finally {
    fs.lstatSync = lstat;
  }
  assert.equal(peer.calls.length, 0);
});

for (const [name, reply] of [
  ['malformed', '{bad\n'],
  ['invalid UTF-8', Buffer.from([0xff, 10])],
  ['oversize', 'x'.repeat(1025)],
  ['truncated', '{"spaces":[]'],
  ['wrong shape', '{"spaces":"private"}\n'],
  ['upstream refusal', '{"error":"PRIVATE_RESPONSE"}\n'],
  ['extra message', JSON.stringify(f.world) + '\n{}\n'],
])
  test(`App ${name} is refused without payload/path disclosure or retries`, async (t) => {
    const peer = await fakeServer(
      t,
      (socket) => socket.end(reply),
      'herdr-app.sock',
    );
    const client = new HerdrAppClient({
      appHome: peer.directory,
      maxBytes: 1024,
    });
    t.after(() => client.dispose());
    await assert.rejects(
      client.ls(),
      (error) =>
        !error.message.includes('PRIVATE_RESPONSE') &&
        !error.message.includes(peer.directory),
    );
    assert.equal(peer.calls.length, 1);
  });

test('timeouts, abort and disposal release pending sockets without retries', async (t) => {
  let notify;
  const received = new Promise((resolve) => {
    notify = resolve;
  });
  const peer = await fakeServer(t, () => notify(), 'herdr-app.sock');
  const timed = new HerdrAppClient({ appHome: peer.directory, timeoutMs: 30 });
  t.after(() => timed.dispose());
  await assert.rejects(timed.ls(), /timeout/);
  const controller = new AbortController();
  const aborted = new HerdrAppClient({ appHome: peer.directory });
  t.after(() => aborted.dispose());
  const pending = aborted.status(controller.signal);
  // The timeout request has already arrived; wait for this request explicitly.
  const second = new Promise((resolve) => {
    for (const client of peer.clients) client.once('data', resolve);
    peer.server.once('connection', (socket) => socket.once('data', resolve));
  });
  await second;
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(aborted.ls(cancelled.signal), /cancelled/);
  const count = peer.calls.length;
  aborted.dispose();
  await assert.rejects(aborted.commands(), /disposed/);
  assert.equal(peer.calls.length, count);
  assert.equal(count, 2);
});

test('core errors and unsupported hello replies invalidate the connection and never replay reads', async (t) => {
  for (const [name, shape] of [
    ['generation', { ...f.hello, generation: 2 }],
    ['framed', { ...f.hello, framed: true }],
    ['methods', { ...f.hello, methods: ['hello'] }],
    ['features', { ...f.hello, features: [] }],
  ])
    await t.test(name, async (t) => {
      const peer = await fakeServer(t, (socket, request) =>
        respond(socket, request, shape),
      );
      const client = new HerdrCoreClient(peer.file);
      t.after(() => client.close());
      await assert.rejects(client.connect());
      assert.equal(client.info, null);
      await assert.rejects(client.list());
      assert.equal(peer.calls.length, 1);
    });
});

test('core version/features changes require explicit reconnect and stale queued reads never cross it', async (t) => {
  let hello = f.hello;
  const peer = await fakeServer(t, (socket, request) => {
    if (request.method === 'hello') respond(socket, request, hello);
    else if (request.method === 'terminal.list')
      respond(socket, request, f.remoteList);
    else if (request.method === 'server.status')
      respond(socket, request, { ...f.coreStatus, version: '0.1.99' });
    else coreReply(socket, request);
  });
  const client = new HerdrCoreClient(peer.file);
  t.after(() => client.close());
  await client.connect();
  assert.deepEqual(await client.list(), f.remoteList);
  const before = peer.calls.length,
    generation = client.generation;
  const status = client.status(),
    queued = client.get('t1');
  await assert.rejects(status, /identity changed/);
  await assert.rejects(queued, /changed/);
  assert.deepEqual(
    peer.calls.slice(before).map((call) => call.method),
    ['server.status'],
  );
  assert(client.generation > generation);
  hello = f.changedFeatures;
  await client.connect();
  assert.deepEqual(client.info.features, hello.features);
  hello = f.changedHello;
  const oldGeneration = client.generation;
  await client.connect();
  assert.equal(client.info.version, '0.1.19');
  assert(client.generation > oldGeneration);
});

test('endpoint replacement during a read is detected before accepting its reply', async (t) => {
  let peer;
  peer = await fakeServer(
    t,
    (socket) => {
      fs.renameSync(peer.file, path.join(peer.directory, 'old.sock'));
      fs.writeFileSync(peer.file, 'replacement', { mode: 0o600 });
      socket.end(JSON.stringify(f.world) + '\n');
    },
    'herdr-app.sock',
  );
  const client = new HerdrAppClient({ appHome: peer.directory });
  t.after(() => client.dispose());
  await assert.rejects(client.ls());
  assert.equal(peer.calls.length, 1);
  await assert.rejects(client.ls(), /Unsafe/);
  assert.equal(peer.calls.length, 1);
});
