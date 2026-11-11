const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { fixture, fact, id, input } = require('../helpers/codex-hook-fixture');
const { main: hookMain } = require('../../src/agents/codex/hook');
const {
  main: configureMain,
  configureHooks,
  hookPlan,
} = require('../../src/agents/codex/configure-hooks');
const {
  readPrivate,
  writePrivate,
} = require('../../src/agents/codex/hook-files');
const {
  hookIdentity,
  readIdentity,
  hookNotice,
} = require('../../src/agents/codex/hook-identity');
const { readHookPeer } = require('../../src/agents/codex/hook-peer');

test('hook proof captures a reused CLI PID even when the reporting daemon stays alive', async (t) => {
  const f = await fixture(t);
  const original = await hookIdentity(f.agent, f.ports);
  f.ports.inspect = async (pid) =>
    pid === 42 ? { ...fact(pid), startedAt: '1794364000.123457' } : fact(pid);
  const replacement = await hookIdentity(f.agent, f.ports);
  assert.notEqual(replacement.epoch, original.epoch);
  const bridge = {
    actionContext: {
      verifyChat: true,
      target: { chatId: id, codexHookEpoch: original.epoch },
    },
  };
  await assert.rejects(
    readIdentity(bridge, f.agent, {
      hook: (agent) => hookIdentity(agent, f.ports),
      footer: async () => assert.fail('no fallback'),
    }),
    /hook changed/,
  );
});

test('direct CLI reports work but two possible reporters never imply authority', async (t) => {
  const f = await fixture(t),
    record = readPrivate(f.recordFile);
  const cliFile = path.join(f.directory, `42-${id}.json`);
  writePrivate(cliFile, { ...record, owner: fact(42) });
  await assert.rejects(hookIdentity(f.agent, f.ports), /report unavailable/);
  fs.unlinkSync(f.recordFile);
  assert.equal((await hookIdentity(f.agent, f.ports)).id, id);
});

for (const [name, replace] of [
  [
    'wrong thread ID',
    (method, result) =>
      method === 'thread/read'
        ? { thread: { id: 'other', cwd: '/fixture' } }
        : result,
  ],
  [
    'wrong thread directory',
    (method, result) =>
      method === 'thread/read' ? { thread: { id, cwd: '/other' } } : result,
  ],
  [
    'a changed loaded set',
    (method, result, reads) =>
      method === 'thread/loaded/list' && reads > 1
        ? { data: [], nextCursor: null }
        : result,
  ],
])
  test(`hook proof rejects ${name} during its bracketed read`, async (t) => {
    const f = await fixture(t),
      connect = f.ports.connect;
    let reads = 0;
    f.ports.connect = async (...args) => {
      const rpc = await connect(...args),
        request = rpc.request;
      rpc.request = async (method, params) => {
        const result = await request(method, params);
        if (method === 'thread/loaded/list') reads++;
        return replace(method, result, reads);
      };
      return rpc;
    };
    await assert.rejects(hookIdentity(f.agent, f.ports));
    assert.equal(f.closed(), 1);
  });

test('an installed but unapproved hook and unsupported backends trigger no native reads', async (t) => {
  const f = await fixture(t);
  f.ports.inspect = async () => assert.fail('no process reads');
  fs.unlinkSync(f.recordFile);
  await assert.rejects(hookIdentity(f.agent, f.ports), /report unavailable/);
  await assert.rejects(
    hookIdentity({ ...f.agent, app: 'claude-code' }, f.ports),
    /unavailable/,
  );
  await assert.rejects(
    hookIdentity({ ...f.agent, backend: 'herdr' }, f.ports),
    /unavailable/,
  );
});

for (const mutation of ['revoke', 'replace'])
  test(`a late ${mutation} during the final peer query cannot return a hook proof`, async (t) => {
    const f = await fixture(t),
      peer = f.ports.peer;
    let reads = 0;
    f.ports.peer = async (...args) => {
      if (++reads === 2) {
        if (mutation === 'revoke')
          writePrivate(f.setup, { ...f.saved, active: false });
        else
          writePrivate(f.recordFile, {
            ...readPrivate(f.recordFile),
            epoch: require('node:crypto').randomUUID(),
          });
      }
      return peer(...args);
    };
    await assert.rejects(hookIdentity(f.agent, f.ports));
  });

test('revocation during the publisher process check wins before record commit', async (t) => {
  const f = await fixture(t),
    before = fs.readFileSync(f.recordFile);
  let reads = 0;
  f.publisher.input = (async function* () {
    yield Buffer.from(JSON.stringify(input()));
  })();
  f.publisher.inspect = async (pid) => {
    if (++reads === 2) writePrivate(f.setup, { ...f.saved, active: false });
    return fact(pid);
  };
  await hookMain(f.publisher);
  assert.deepEqual(fs.readFileSync(f.recordFile), before);
});

test('standalone hook entry succeeds silently and emits no errors for refused reports', async (t) => {
  const f = await fixture(t);
  f.publisher.input = (async function* () {
    yield Buffer.from(JSON.stringify(input({ prompt: 'PRIVATE' })));
  })();
  await hookMain(f.publisher);
  assert(!JSON.stringify(readPrivate(f.recordFile)).includes('PRIVATE'));
  const previous = fs.readFileSync(f.recordFile);
  f.publisher.input = (async function* () {
    yield Buffer.from('bad PRIVATE');
  })();
  await hookMain(f.publisher);
  assert.deepEqual(fs.readFileSync(f.recordFile), previous);
  writePrivate(f.setup, { ...f.saved, active: false });
  f.publisher.inspect = async () =>
    assert.fail('revoked hooks must not inspect processes');
  await hookMain(f.publisher);
});

test('hook configuration CLI emits only a bounded setup summary and no received error', () => {
  const calls = [],
    written = [];
  let errors = 0;
  const configure = (options) => {
    calls.push(options);
    return { setup: { active: !options.remove } };
  };
  const output = {
    write: (value) => written.push(value),
    error: () => errors++,
  };
  for (const args of [[], ['--apply'], ['--remove', '--apply']])
    configureMain(args, configure, output);
  assert.equal(calls.length, 3);
  assert.match(written[0], /applyRequired/);
  assert.match(written[1], /trust/);
  assert.match(written[2], /removed/);
  configureMain(['--unknown'], configure, output);
  configureMain(
    [],
    () => {
      throw Error('PRIVATE');
    },
    output,
  );
  assert.equal(errors, 2);
  assert(!written.join('').includes('PRIVATE'));
});

test('hook diagnostics explain ambiguity without echoing private or prototype values', () => {
  assert.match(
    hookNotice(Error('Codex hook client ambiguous')),
    /multiple daemon clients/,
  );
  assert.match(
    hookNotice(Error('Codex hook thread ambiguous')),
    /loaded threads/,
  );
  for (const message of [
    'PRIVATE /home/secret',
    'constructor',
    'toString',
    '__proto__',
  ]) {
    const notice = hookNotice(Error(message));
    assert.equal(typeof notice, 'string');
    assert(notice.length <= 160);
    assert(!notice.includes(message));
  }
  assert.equal(
    hookNotice(Object.assign(Error('PRIVATE'), { code: 'ENOENT' })),
    undefined,
  );
  assert.equal(hookNotice(Error('Codex hooks unavailable')), undefined);
});

test('configuration refuses malformed and symlinked files without touching other settings', async (t) => {
  const f = await fixture(t),
    home = path.join(f.directory, 'home'),
    directory = path.join(f.directory, 'plugin');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'codex-hook.js'), 'fixture');
  const file = path.join(home, 'hooks.json'),
    options = { home, directory, apply: true };
  for (const value of ['null', '[]', '{', '{"hooks":{"SessionStart":[{}]}}']) {
    fs.writeFileSync(file, value, { mode: 0o600 });
    assert.throws(() => configureHooks(options));
    assert.equal(fs.readFileSync(file, 'utf8'), value);
  }
  fs.unlinkSync(file);
  fs.symlinkSync(f.setup, file);
  assert.throws(() => configureHooks(options));
  assert.throws(() => configureHooks({ ...options, home: 'relative' }));
  assert.throws(() =>
    hookPlan({ hooks: [] }, null, 'command', '/fixture/hooks.json'),
  );
});

test('peer probe validates only a private fixture socket and never connects to it', async (t) => {
  const f = await fixture(t),
    socket = path.join(f.directory, 'owned.sock');
  let connections = 0;
  const server = net.createServer(() => connections++);
  server.listen(socket);
  await once(server, 'listening');
  fs.chmodSync(socket, 0o600);
  t.after(() => server.close());
  const output = `codex 42 owner 4u unix 0x1 0t0 ->0x2\ncodex 80 owner 5u unix 0x2 0t0 ${socket}\n`;
  const result = await readHookPeer(42, async (file, args, options) => {
    assert.equal(file, '/usr/sbin/lsof');
    assert.equal(args.at(-1), String(process.getuid()));
    assert.equal(options.timeout, 1500);
    return output;
  });
  assert.equal(result.socket, socket);
  assert.equal(connections, 0);
  fs.chmodSync(socket, 0o666);
  await assert.rejects(
    readHookPeer(42, async () => output),
    /Unsafe CLI daemon socket/,
  );
});
