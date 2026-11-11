const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { digest, hookInput } = require('../../src/agents/codex/hook-contract');
const {
  readPrivate,
  writePrivate,
} = require('../../src/agents/codex/hook-files');
const {
  inspectProcess,
  hookOwner,
} = require('../../src/agents/codex/hook-process');
const {
  peerFromListing,
  readHookPeer,
} = require('../../src/agents/codex/hook-peer');
const { runHook } = require('../../src/agents/codex/hook');
const {
  hookIdentity,
  readIdentity,
} = require('../../src/agents/codex/hook-identity');
const {
  hookPlan,
  configureHooks,
} = require('../../src/agents/codex/configure-hooks');
const { stamp, snapshot } = require('../../src/guards/context');

const {
  fixture,
  id,
  session,
  block,
  fact,
  input,
} = require('../helpers/codex-hook-fixture');

test('Codex hook publishes minimal private identity and verifies one CLI and one loaded thread', async (t) => {
  const f = await fixture(t);
  const record = readPrivate(f.recordFile);
  assert(!JSON.stringify(record).includes('PRIVATE'));
  assert.equal(record.cwd, undefined);
  assert.equal(record.cwdHash, digest('/fixture'));
  assert.equal(fs.statSync(f.recordFile).mode & 0o777, 0o600);
  const proof = await hookIdentity(f.agent, f.ports);
  assert.equal(proof.id, id);
  assert.equal(proof.epoch.length, 64);
  assert.notEqual(
    proof.epoch,
    record.epoch,
    'proof also captures the CLI and daemon process generations',
  );
  assert.deepEqual(
    f.calls.map(({ method }) => method),
    ['thread/loaded/list', 'thread/read', 'thread/loaded/list'],
  );
  assert.equal(f.calls[1].params.includeTurns, false);
  assert.equal(f.closed(), 1);
});

for (const [name, change] of [
  [
    'another pane',
    (f) => (f.agent.block = 'block:01a1ae31-d050-7503-afec-fd2b40d2bc29'),
  ],
  [
    'another Rex session',
    (f) => (f.agent.session = 'session:01a1ae31-d050-7503-afec-fd2b40d2bc29'),
  ],
  ['another folder', (f) => (f.agent.cwd = '/other')],
  [
    'a reused daemon PID',
    (f) =>
      (f.ports.inspect = async (pid) => ({
        ...fact(pid),
        startedAt: 'replaced',
      })),
  ],
  [
    'an exited session',
    (f) =>
      writePrivate(f.recordFile, { ...readPrivate(f.recordFile), ended: true }),
  ],
  ['an expired report', (f) => (f.ports.now = () => 86410001)],
  ['a future report', (f) => (f.ports.now = () => 8999)],
  [
    'revoked consent',
    (f) => writePrivate(f.setup, { ...f.saved, active: false }),
  ],
  [
    'a new integration epoch',
    (f) => writePrivate(f.setup, { ...f.saved, epoch: randomUUID() }),
  ],
  [
    'a non-Codex foreground process',
    (f) => (f.ports.inspect = async (pid) => ({ ...fact(pid), codex: false })),
  ],
])
  test(`Codex hook refuses ${name}`, async (t) => {
    const f = await fixture(t);
    change(f);
    await assert.rejects(hookIdentity(f.agent, f.ports));
  });

for (const [name, reply] of [
  ['multiple loaded threads', { data: [id, randomUUID()], nextCursor: null }],
  ['unseen loaded threads', { data: [id], nextCursor: 'more' }],
  ['no loaded thread', { data: [], nextCursor: null }],
  ['malformed metadata', { data: null }],
])
  test(`Codex hook refuses ${name} and closes its reader`, async (t) => {
    const f = await fixture(t);
    f.ports.connect = async () => ({
      request: async () => reply,
      close() {
        f.wasClosed = true;
      },
    });
    await assert.rejects(hookIdentity(f.agent, f.ports));
    assert.equal(f.wasClosed, true);
  });

for (const [name, change] of [
  ['revocation', (f) => writePrivate(f.setup, { ...f.saved, active: false })],
  [
    'a new hook report',
    (f) =>
      writePrivate(f.recordFile, {
        ...readPrivate(f.recordFile),
        epoch: randomUUID(),
      }),
  ],
  [
    'a replaced client',
    (f) =>
      (f.ports.peer = async () => ({
        pid: 99,
        socket: '/other.sock',
        clients: [42],
      })),
  ],
  [
    'a replaced process image',
    (f) =>
      (f.ports.inspect = async (pid) => ({
        ...fact(pid),
        image: digest('/replacement'),
      })),
  ],
])
  test(`Codex hook rechecks ${name} after its thread read`, async (t) => {
    const f = await fixture(t);
    const connect = f.ports.connect;
    f.ports.connect = async (...args) => {
      const rpc = await connect(...args),
        request = rpc.request;
      rpc.request = async (method, params) => {
        const result = await request(method, params);
        if (method === 'thread/read') change(f);
        return result;
      };
      return rpc;
    };
    await assert.rejects(hookIdentity(f.agent, f.ports));
    assert.equal(f.closed(), 1);
  });

test('Codex hook rejects subagents, malformed payloads and consent revoked while reading', async (t) => {
  const f = await fixture(t);
  for (const patch of [
    { agent_id: 'child' },
    { subagent: {} },
    { session_id: '../bad' },
    { hook_event_name: 'SubagentStart' },
    { cwd: 'relative' },
  ])
    assert.throws(() => hookInput.parse(input(patch)));
  const old = fs.readFileSync(f.recordFile);
  f.publisher.input = (async function* () {
    yield Buffer.from(JSON.stringify(input()));
    writePrivate(f.setup, { ...f.saved, active: false });
  })();
  await assert.rejects(runHook(f.publisher));
  assert.deepEqual(fs.readFileSync(f.recordFile), old);
  f.publisher.input = (async function* () {
    yield Buffer.alloc(1048577);
  })();
  writePrivate(f.setup, f.saved);
  await assert.rejects(runHook(f.publisher));
});

test('Codex hook does not infer process ownership from payload IDs', async () => {
  const visited = [];
  const owner = await hookOwner(90, async (pid) => {
    visited.push(pid);
    return pid === 90 ? { ...fact(pid), codex: false, parent: 80 } : fact(pid);
  });
  assert.equal(owner.pid, 80);
  assert.deepEqual(visited, [90, 80]);
  await assert.rejects(
    hookOwner(90, async (pid) => ({ ...fact(pid), codex: false, parent: pid })),
  );
  let read = 0;
  const execute = async () =>
    `${process.getuid()} 1 Tue Nov 10 10:00:00 2026 /fixture/codex${++read === 2 ? '-other' : ''}`;
  await assert.rejects(inspectProcess(42, execute));
  await assert.rejects(inspectProcess(0, execute));
});

const listing = (extra = '') =>
  `codex 42 owner 4u unix 0x1 0t0 ->0x2\ncodex 80 owner 5u unix 0x2 0t0 /fixture/daemon.sock\n${extra}`;
test('Codex hook peer proof rejects every other client including Desktop and another CLI', async () => {
  assert.deepEqual(peerFromListing(listing(), 42, 999).clients, [42]);
  for (const name of ['codex', 'Electron', 'node'])
    assert.throws(() =>
      peerFromListing(
        listing(
          `${name} 43 owner 6u unix 0x3 0t0 ->0x4\ncodex 80 owner 7u unix 0x4 0t0 /fixture/daemon.sock`,
        ),
        42,
        999,
      ),
    );
  assert.deepEqual(
    peerFromListing(
      listing(
        'node 999 owner 6u unix 0x3 0t0 ->0x4\ncodex 80 owner 7u unix 0x4 0t0 /fixture/daemon.sock',
      ),
      42,
      999,
    ),
    peerFromListing(listing(), 42, 999),
    'opening the plugin reader cannot change the external-client proof',
  );
  await assert.rejects(
    readHookPeer(42, async () => {
      throw Error('PRIVATE');
    }),
  );
});

test('Codex hook files refuse symlinks, hard links and public permissions', async (t) => {
  const f = await fixture(t);
  const link = path.join(f.directory, 'link');
  fs.symlinkSync(f.recordFile, link);
  assert.throws(() => readPrivate(link));
  fs.linkSync(f.recordFile, path.join(f.directory, 'hard'));
  assert.throws(() => readPrivate(f.recordFile));
  fs.unlinkSync(path.join(f.directory, 'hard'));
  fs.chmodSync(f.recordFile, 0o644);
  assert.throws(() => readPrivate(f.recordFile));
  fs.chmodSync(f.directory, 0o755);
  assert.throws(() => readPrivate(f.setup));
});

test('Codex setup previews, backs up, preserves other hooks and removes only its own commands', async (t) => {
  const f = await fixture(t);
  const home = path.join(f.directory, 'home'),
    directory = path.join(f.directory, 'plugin');
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'codex-hook.js'), 'fixture');
  const hooksFile = path.join(home, 'hooks.json');
  const original = {
    hooks: {
      SessionStart: [
        {
          matcher: 'startup',
          hooks: [{ type: 'command', command: 'foreign' }],
        },
      ],
    },
    custom: true,
  };
  fs.writeFileSync(hooksFile, JSON.stringify(original), { mode: 0o600 });
  const config = path.join(home, 'config.toml');
  fs.writeFileSync(config, '[tui]\nstatus_line = ["model-name"]\n');
  const before = fs.readFileSync(config);
  const options = { home, directory, node: '/fixture/node' };
  configureHooks(options);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(hooksFile)),
    original,
    'preview never applies',
  );
  const first = configureHooks({ ...options, apply: true });
  assert.deepEqual(
    first.settings.hooks.SessionStart[0],
    original.hooks.SessionStart[0],
  );
  assert.equal(first.settings.hooks.SessionStart.length, 2);
  const second = configureHooks({ ...options, apply: true });
  assert.deepEqual(second, first, 'same-path installation is idempotent');
  assert.equal(
    fs.readdirSync(path.join(directory, 'state/codex-backups')).length,
    2,
  );
  configureHooks({ ...options, apply: true, remove: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(hooksFile)), original);
  assert.deepEqual(
    fs.readFileSync(config),
    before,
    'status line and config are never written',
  );
  assert.equal(
    readPrivate(path.join(directory, 'state/codex-setup.json')).active,
    false,
  );
  assert.throws(() => hookPlan({}, first.setup, 'other-command', hooksFile));
  assert.throws(() =>
    hookPlan({ hooks: { SessionStart: [null] } }, null, 'command', hooksFile),
  );
});

test('hook epochs participate in stale-press snapshots without changing legacy stamps', () => {
  const agent = { session, block, pid: 42, app: 'codex', state: 'idle' };
  assert.equal(stamp(agent), stamp({ ...agent, codexHookEpoch: undefined }));
  const first = { ...agent, codexHookEpoch: randomUUID() };
  assert.equal(snapshot(first).codexHookEpoch, first.codexHookEpoch);
  assert.notEqual(
    stamp(first),
    stamp({ ...first, codexHookEpoch: randomUUID() }),
  );
});

test('Codex hook and footer sources cannot silently replace a captured hook binding', async () => {
  const agent = {
    session,
    block,
    pid: 42,
    app: 'codex',
    cwd: '/fixture',
    state: 'idle',
  };
  let footerReads = 0;
  const ports = {
    hook: async () => ({ id, epoch: 'epoch-one' }),
    footer: async () => {
      footerReads++;
      return id;
    },
  };
  assert.equal(await readIdentity({}, agent, ports), id);
  assert.equal(agent.codexHookEpoch, 'epoch-one');
  assert.equal(footerReads, 0);
  const bridge = {
    actionContext: {
      verifyChat: true,
      target: { chatId: id, codexHookEpoch: 'epoch-one' },
    },
  };
  assert.equal(await readIdentity(bridge, { ...agent }, ports), id);
  await assert.rejects(
    readIdentity(
      { actionContext: { verifyChat: true, target: { chatId: id } } },
      { ...agent },
      ports,
    ),
    /identity changed/,
  );
  ports.hook = async () => ({ id, epoch: 'epoch-two' });
  await assert.rejects(
    readIdentity(bridge, { ...agent }, ports),
    /hook changed/,
  );
  ports.hook = async () => {
    throw Error('PRIVATE');
  };
  await assert.rejects(
    readIdentity(bridge, { ...agent }, ports),
    /proof unavailable/,
  );
  assert.equal(
    footerReads,
    0,
    'a captured hook must never fall back after possible delivery',
  );
  assert.equal(
    await readIdentity({}, agent, ports),
    id,
    'independent footer verification remains available before capture',
  );
  assert.equal(agent.codexHookEpoch, undefined);
  assert.equal(footerReads, 1);
  assert.equal(await readIdentity({ backend: 'herdr' }, agent, ports), id);
  assert.equal(footerReads, 2);
});
