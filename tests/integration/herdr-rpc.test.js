'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  net = require('node:net'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const {
  HerdrRpc,
  endpoint,
} = require('../../src/terminals/herdr-tui/rpc');
test('herdr rpc', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-herdr-rpc-'));
  fs.chmodSync(dir, 0o700);
  const file = path.join(dir, 'session.sock'),
    calls = [],
    clients = new Set();
  let mode = 'normal';
  const server = net.createServer((socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk;
      let i;
      while ((i = data.indexOf('\n')) >= 0) {
        const m = JSON.parse(data.slice(0, i));
        data = data.slice(i + 1);
        calls.push(m);
        if (m.method === 'pane.zoom' && mode === 'disconnect') {
          socket.destroy();
          continue;
        }
        if (m.method === 'agent.get' && mode === 'timeout') continue;
        if (m.method === 'agent.get' && mode === 'malformed') {
          socket.write('{bad json\n');
          continue;
        }
        if (m.method === 'agent.get' && mode === 'error') {
          socket.write(
            JSON.stringify({
              id: m.id,
              error: { message: 'PRIVATE_RESPONSE' },
            }) + '\n',
          );
          continue;
        }
        const result =
          m.method === 'ping'
            ? {
                type: 'pong',
                protocol: mode === 'unsupported' ? 23 : 22,
                version: '0.9.5',
              }
            : { type: 'agent_info', agent: { name: '測試' } };
        const response = Buffer.from(
          JSON.stringify({ id: m.id, result }) + '\n',
        );
        const split = response.indexOf(Buffer.from('測')) + 1;
        if (m.method === 'agent.get') {
          socket.write(response.subarray(0, split));
          setImmediate(() => socket.write(response.subarray(split)));
        } else socket.end(response);
      }
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(file, resolve);
    });
    fs.chmodSync(file, 0o600);
    assert(endpoint(file).scope.startsWith('herdr:'));
    const rpc = await new HerdrRpc(file).connect();
    assert.equal(
      (await rpc.request('agent.get', { target: 'w1:p1' })).agent.name,
      '測試',
      'fragmented UTF-8 must survive framing',
    );
    const before = calls.length;
    for (const [method, params] of [
      ['agent.prompt', { target: 'w1:p1', text: 'submit' }],
      ['pane.send_text', { pane_id: 'w1:p1', text: 'input' }],
      ['server.stop', {}],
      ['agent.send_keys', { target: 'w1:p1', keys: ['enter', 'enter'] }],
      ['agent.send_keys', { target: 'name', keys: ['enter'] }],
      ['pane.zoom', { mode: 'toggle' }],
      [
        'agent.read',
        { target: 'w1:p1', source: 'recent', format: 'text', strip_ansi: true },
      ],
    ])
      await assert.rejects(() => rpc.request(method, params));
    assert.equal(
      calls.length,
      before,
      'invalid or unscoped requests never reach the server',
    );
    rpc.close();
    mode = 'unsupported';
    await assert.rejects(() => new HerdrRpc(file).connect(), /not verified/);
    assert.equal(calls.at(-1).method, 'ping');
    mode = 'disconnect';
    const disconnected = await new HerdrRpc(file).connect(),
      start = calls.length;
    await assert.rejects(() =>
      disconnected.request('pane.zoom', { pane_id: 'w1:p1', mode: 'toggle' }),
    );
    assert.equal(
      calls.slice(start).filter((c) => c.method === 'pane.zoom').length,
      1,
      'never replay uncertain mutations',
    );
    disconnected.close();
    mode = 'timeout';
    const timeout = await new HerdrRpc(file, { timeout: 80 }).connect();
    await assert.rejects(
      () => timeout.request('agent.get', { target: 'w1:p1' }),
      /timeout/,
    );
    timeout.close();
    mode = 'malformed';
    const malformed = await new HerdrRpc(file).connect();
    await assert.rejects(() =>
      malformed.request('agent.get', { target: 'w1:p1' }),
    );
    malformed.close();
    mode = 'error';
    const refused = await new HerdrRpc(file).connect();
    await assert.rejects(
      () => refused.request('agent.get', { target: 'w1:p1' }),
      (e) => !e.message.includes('PRIVATE_RESPONSE'),
    );
    refused.close();
    fs.chmodSync(file, 0o666);
    assert.throws(() => endpoint(file), /Unsafe/);
    fs.chmodSync(file, 0o600);
    fs.symlinkSync(file, path.join(dir, 'link.sock'));
    assert.throws(() => endpoint(path.join(dir, 'link.sock')), /Unsafe/);
  } finally {
    for (const c of clients) c.destroy();
    if (server.listening) await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(
    'PASS Herdr secure explicit endpoint, protocol handshake, fragmented Unicode JSON, strict request scope, no composer submissions, disconnect/timeout handling and no mutation retries',
  );
});
