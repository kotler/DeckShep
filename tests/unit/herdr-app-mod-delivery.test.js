const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const vm = require('node:vm');
const {
  ModTerminalStream,
  streamFrame,
} = require('../helpers/herdr-app-mod-stream');
const { KeyboardScreen } = require('../helpers/keyboard-screen');
const {
  ModDeliveryRig,
  modelModSource,
  relaySchema,
} = require('../live/herdr-app-model/delivery-rig.cjs');
const { releasePolicy } = require('../live/app-calibration/release-policy.cjs');

test('the optional Codex containment additions grant only scoped preference and system reads', (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mod-policy-')),
  );
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const normal = releasePolicy(root, [], 12345);
  const codex = releasePolicy(root, [], 12345, { codexPreferences: true });
  assert(!normal.includes('(ipc-posix-name "apple.cfprefs.'));
  assert(codex.includes('(info-type "vfs.disk-space")'));
  assert(
    codex.includes(
      '(ipc-posix-name "apple.cfprefs.' + process.getuid() + 'v1")',
    ),
  );
  assert(codex.includes('(ipc-posix-name "apple.cfprefs.daemonv1")'));
  assert(codex.includes('(preference-domain "com.openai.codex")'));
  assert(!codex.includes('user-preference-write'));
  assert(!codex.includes('(allow user-preference-read)'));
  assert(codex.includes('(deny default)'));
  assert(!codex.includes('(allow network-outbound)'));
});

async function fakeCore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mod-stream-'));
  const writes = [],
    requests = [];
  let connected;
  const server = net.createServer((socket) => {
    connected = socket;
    let buffer = Buffer.alloc(0),
      framed = false;
    socket.on('data', (bytes) => {
      buffer = Buffer.concat([buffer, bytes]);
      if (!framed) {
        const end = buffer.indexOf(10);
        if (end < 0) return;
        requests.push(JSON.parse(buffer.subarray(0, end)));
        buffer = buffer.subarray(end + 1);
        framed = true;
        socket.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: { core: { id: 'owned' } },
          }) + '\n',
        );
      }
      while (buffer.length >= 9) {
        const channel = buffer.readUInt32LE(0),
          kind = buffer[4],
          length = buffer.readUInt32LE(5);
        if (buffer.length < length + 9) return;
        const data = buffer.subarray(9, length + 9);
        buffer = buffer.subarray(length + 9);
        if (channel === 0) {
          const request = JSON.parse(data);
          requests.push(request);
          if (request.method !== 'terminal.attach') {
            assert(['terminal.get', 'terminal.keys'].includes(request.method));
            socket.write(
              streamFrame(
                0,
                0,
                Buffer.from(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {},
                  }),
                ),
              ),
            );
            continue;
          }
          const reply = streamFrame(
            0,
            0,
            Buffer.from(
              JSON.stringify({ jsonrpc: '2.0', id: 2, result: { channel: 7 } }),
            ),
          );
          const paint = streamFrame(
            7,
            0,
            Buffer.from(
              '\x18\x1b[2J\x1b[H› Ask Codex to do anything\r\n\r\n  Alpha high\x1b[1;3H\x1b[?25h',
            ),
          );
          // Reply and paint may share a read; framing and UTF-8 may split anywhere.
          const both = Buffer.concat([reply, paint]);
          socket.write(both.subarray(0, 13));
          socket.write(both.subarray(13));
        } else writes.push({ channel, kind, data });
      }
    });
  });
  await new Promise((resolve) =>
    server.listen(path.join(root, 'core.sock'), resolve),
  );
  t.after(async () => {
    connected?.destroy();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    file: path.join(root, 'core.sock'),
    writes,
    requests,
    get socket() {
      return connected;
    },
  };
}
test('raw mod viewer reads an actual framed paint and cursor and uses only ordinary DATA', async (t) => {
  const core = await fakeCore(t),
    stream = new ModTerminalStream(80, 24);
  t.after(() => stream.close());
  let peers = 0;
  await stream.connect(core.file, 't1', 'owned', async () => {
    peers++;
  });
  const view = await stream.read();
  assert.equal(peers, 1);
  assert.equal(view.text, '› Ask Codex to do anything\n\n  Alpha high');
  assert.deepEqual(view.cursor, { row: 1, column: 3 });
  assert.deepEqual(core.requests[1].params, {
    terminal: 't1',
    cols: 80,
    rows: 24,
    history: 0,
    observe: false,
  });
  stream.write(Buffer.from('\x1b[B'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(
    core.writes.filter((x) => x.kind !== 1),
    [{ channel: 7, kind: 0, data: Buffer.from('\x1b[B') }],
  );
  core.socket.write(streamFrame(7, 0, Buffer.from('\x1b[?25l')));
  assert.equal((await stream.read()).cursor, null);
  assert.notEqual(
    stream.current().hash,
    view.hash,
    'cursor changes invalidate a view even with identical text',
  );
  core.socket.end(streamFrame(7, 2, Buffer.alloc(0)));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.throws(() => stream.write(Buffer.from('s')), /unavailable/);
});
test('raw mod viewer refuses a different Core before opening a terminal', async (t) => {
  const core = await fakeCore(t),
    stream = new ModTerminalStream(80, 24);
  t.after(() => stream.close());
  await assert.rejects(
    stream.connect(core.file, 't1', 'wrong', async () => {}),
    /Core changed/,
  );
  assert.equal(core.requests.length, 1);
});

test('input-gate probe bounds its competitor and fences DATA on the attached connection', async (t) => {
  const core = await fakeCore(t),
    stream = new ModTerminalStream(80, 24);
  t.after(() => stream.close());
  await stream.connect(core.file, 't1', 'owned', async () => {});
  for (const count of [0, 161, 1.5, NaN])
    await assert.rejects(stream.probeKeySequence(count), /sequence refused/);
  assert.equal(core.requests.length, 2);
  await stream.probeKeySequence(2);
  assert.deepEqual(core.requests[2].params, {
    terminal: 't1',
    keys: ['a', 'b', 'b', 'c'],
  });
  stream.write(Buffer.from('d'));
  await stream.probeInputBarrier();
  assert.deepEqual(core.requests[3], {
    jsonrpc: '2.0',
    id: 4,
    method: 'terminal.get',
    params: { terminal: 't1' },
  });
  assert.deepEqual(
    core.writes.filter((x) => x.kind !== 1),
    [{ channel: 7, kind: 0, data: Buffer.from('d') }],
  );
  await stream.probeQueuedKey();
  assert.deepEqual(core.requests[4].params, {
    terminal: 't1',
    keys: ['f'],
  });
});

function rigFixture() {
  const run = {
    gate: { checkBoth() {} },
    owned: { assert() {}, inspect: () => ({ pid: 42, started: 'first' }) },
  };
  const rig = new ModDeliveryRig(run),
    screen = new KeyboardScreen();
  screen.models = ['Alpha', 'Beta'];
  const focused = { space: 's', tab: 'tab', pane: 'p', terminal: 't1' };
  const nonce = 'a'.repeat(32);
  const operation = {
    request: { nonce, pressedAt: Date.now(), focused, pid: 42, created_ms: 10 },
    next: 1,
    revision: null,
    retired: false,
    writes: 0,
  };
  rig.operations.set(nonce, operation);
  rig.streams.set('t1', {
    pid: 42,
    created_ms: 10,
    lifetime: { pid: 42, started: 'first' },
    stream: {
      assertOpen() {},
      current: () => screen.view(),
      read: async () => screen.view(),
      write: () => screen.send('/model'),
    },
  });
  const message = {
    protocol: 1,
    nonce,
    step: 1,
    op: 'paste',
    selected: { focused, pid: 42, created_ms: 10, revision: 1 },
    hash: screen.view().hash,
    value: '/model',
  };
  rig.capture = async () => ({ focused, pid: 42, created_ms: 10 });
  return { rig, operation, message, screen };
}
test('a valid mod relay effect passes through the real delivery kernel once', async () => {
  const { rig, operation, message, screen } = rigFixture();
  await rig.handle(message);
  assert.equal(operation.writes, 1);
  assert.deepEqual(screen.trace, ['/model']);
  await assert.rejects(rig.handle(message), /retired/);
  assert.equal(operation.writes, 1);
});
for (const failure of ['expired', 'retired', 'target changed', 'view changed'])
  test(
    'mod relay refuses ' + failure + ' before the terminal write',
    async () => {
      const { rig, operation, message, screen } = rigFixture();
      if (failure === 'expired') operation.request.pressedAt -= 2100;
      if (failure === 'retired') operation.retired = true;
      if (failure === 'target changed') message.selected.pid++;
      if (failure === 'view changed') screen.draft = 'changed';
      await assert.rejects(rig.handle(message), new RegExp(failure));
      assert.equal(operation.writes, 0);
      assert.equal(screen.trace.length, 0);
    },
  );
test('retirement during a held relay stops the first effect and consumes the step', async () => {
  const { rig, operation, message, screen } = rigFixture();
  rig.hold = async () => {
    await Promise.resolve();
    operation.retired = true;
  };
  await assert.rejects(rig.handle(message), /retired/);
  await assert.rejects(rig.handle(message), /retired/);
  assert.equal(screen.trace.length, 0);
});
test('a replacement CLI process cannot reuse a mod delivery even with the same PID', async () => {
  const { rig, operation, message, screen } = rigFixture();
  rig.hold = async () => {
    rig.run.owned.inspect = () => ({ pid: 42, started: 'replacement' });
  };
  await assert.rejects(rig.handle(message), /target changed/);
  assert.equal(operation.writes, 0);
  assert.deepEqual(screen.trace, []);
});
test('fresh observation catches a focus change during a held relay', async () => {
  const { rig, operation, message, screen } = rigFixture();
  rig.hold = async () => {
    rig.capture = async () => ({
      focused: { ...message.selected.focused, pane: 'other' },
      pid: 42,
      created_ms: 10,
    });
  };
  await assert.rejects(rig.handle(message), /target changed/);
  assert.equal(operation.writes, 0);
  assert.deepEqual(screen.trace, []);
});
test('observed focus ABA and expiry after the relay hold each stop the first effect', async () => {
  for (const reason of ['target changed', 'expired']) {
    const { rig, operation, message, screen } = rigFixture();
    operation.request.observedFocusRevision = 1;
    rig.capture = async () => ({
      focused: message.selected.focused,
      pid: 42,
      created_ms: 10,
      observedFocusRevision: reason === 'target changed' ? 3 : 1,
    });
    rig.hold = async () => {
      if (reason === 'expired') operation.request.pressedAt -= 2100;
    };
    await assert.rejects(rig.handle(message), new RegExp(reason));
    assert.equal(operation.writes, 0);
    assert.deepEqual(screen.trace, []);
  }
});
test('the mod relay validates its fixed operation vocabulary', () => {
  const { message } = rigFixture();
  assert(relaySchema.safeParse(message).success);
  for (const patch of [
    { op: 'exec' },
    { value: '/permissions' },
    {
      selected: {
        ...message.selected,
        focused: { ...message.selected.focused, terminal: 'remote/t1' },
      },
    },
    { transcript: 'private' },
  ])
    assert(!relaySchema.safeParse({ ...message, ...patch }).success);
});

test('the actual mod runs the Rex cycle and refuses an observed focus ABA', async () => {
  const source = (await modelModSource())
    .replace(
      "import { View, div } from 'gpui-kit';",
      'const { View, div } = mocks;',
    )
    .replace("import * as herdr from 'herdr';", 'const herdr = mocks.herdr;')
    .replace('export default class ', 'globalThis.Mod = class ');
  async function execute(mode) {
    const screen = new KeyboardScreen();
    screen.models = ['Alpha', 'Beta'];
    const focused = { space: 's', tab: 'tab', pane: 'p', terminal: 't1' };
    let current = focused,
      result,
      mod;
    const request = {
      protocol: 1,
      nonce: 'a'.repeat(32),
      pressedAt: Date.now(),
      focused,
      pid: 42,
      created_ms: 10,
    };
    const herdr = {
      focused: () => current,
      terminals: () => [{ address: 't1', pid: 42, created_ms: 10 }],
      appHome: () => '/test',
      readTextFile: async () => JSON.stringify(request),
      writeTextFile: async (_, next) => {
        result = JSON.parse(next);
      },
      exec: async (_, [raw]) => {
        const message = JSON.parse(raw);
        if (mode === 'aba' && message.op === 'read') {
          current = { ...focused, pane: 'b' };
          mod.render();
          current = focused;
          mod.render();
        }
        if (message.op !== 'read') screen.send(message.value);
        if (mode === 'lost' && message.op === 'paste')
          throw Error('lost reply');
        return {
          code: 0,
          stdout: JSON.stringify({
            ok: true,
            view: screen.view(),
            writes: screen.trace.length,
          }),
        };
      },
    };
    const context = {
      mocks: { View: class {}, div: () => ({ child() {} }), herdr },
    };
    vm.runInNewContext(source, context);
    mod = new context.Mod();
    mod.previous = '{}';
    mod.consumed = new Set();
    mod.focusKey = '';
    mod.focusRevision = 0;
    await mod.model();
    const calls = screen.trace.length;
    await mod.model();
    assert.equal(
      screen.trace.length,
      calls,
      'replaying the same nonce never retries the operation',
    );
    return { result, screen };
  }
  const normal = await execute('normal');
  assert.equal(normal.result.kind, 'confirmed');
  assert.equal(normal.screen.model, 1);
  assert.equal(normal.screen.effort, 1);
  const stale = await execute('aba');
  assert.equal(stale.result.reason, 'target changed');
  assert.deepEqual(stale.screen.trace, []);
  const lost = await execute('lost');
  assert.equal(lost.result.kind, 'uncertain');
  assert.deepEqual(
    lost.screen.trace,
    ['/model'],
    'no retry, fallback or cleanup after a lost apply reply',
  );
});
