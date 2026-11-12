'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events');
const {
  BackgroundControls,
  terminalIds,
} = require('../../src/agents/codex/background');
const { AgentMetadata } = require('../../src/agents/codex/metadata'),
  { DaemonRpc } = require('../../src/agents/codex/daemon'),
  C = require('../../src/guards/context'),
  { agentLines } = require('../../src/domain/labels'),
  { harness } = require('../helpers/plugin-harness');
const id = '01a1af76-6618-7492-9377-d709a7fe8594';
function fixture() {
  let ids = ['p1', 'p2'],
    turn = { id: 'turn', status: 'interrupted' },
    footer = id,
    endpoint = { pid: 50, socket: '/socket' },
    interruptReply = {},
    time = 100;
  const calls = [],
    agent = {
      app: 'codex',
      name: 'codex',
      session: 's',
      block: 'a',
      pid: 42,
      cwd: '/project',
      state: 'working',
      statusAt: 'v1',
      activityStatusAt: 'v1',
      chatId: id,
      backgroundOnly: true,
      backgroundIds: [...ids],
      backgroundTurnId: 'turn',
    },
    b = { config: { metadataRefreshMs: 0 }, checked: async () => agent };
  const thread = {
    id,
    cwd: agent.cwd,
    name: 'Test',
    model: 'test',
    status: { type: 'active', activeFlags: [] },
  };
  const rpc = {
    serverVersion: '0.167.0',
    close() {
      this.closed = true;
    },
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === 'thread/loaded/list') return { data: [id] };
      if (method === 'thread/read') return { thread };
      if (method === 'thread/turns/list')
        return { data: [{ ...turn, items: [], itemsView: 'notLoaded' }] };
      if (method === 'thread/backgroundTerminals/list')
        return {
          data: ids.map((processId) => ({
            processId,
            command: 'PRIVATE COMMAND',
          })),
          nextCursor: null,
        };
      if (method === 'thread/backgroundTerminals/terminate') {
        ids = ids.filter((x) => x !== params.processId);
        return { terminated: true };
      }
      if (method === 'turn/interrupt') return interruptReply;
      throw Error('Unexpected method');
    },
  };
  b.deliverMutation = async (_target, _method, operation) => operation();
  const deps = {
    socketFor: async () => endpoint,
    connect: async () => rpc,
    footer: async () => footer,
  };
  return {
    b,
    agent,
    rpc,
    thread,
    calls,
    deps,
    control: () => new BackgroundControls(b, deps),
    setIds: (v) => (ids = v),
    setTurn: (v) => (turn = v),
    setFooter: (v) => (footer = v),
    setEndpoint: (v) => (endpoint = v),
    setInterruptReply: (v) => (interruptReply = v),
    reader: () => new AgentMetadata(b, { ...deps, now: () => time }),
    tick: () => time++,
  };
}
test('background controls', async () => {
  const f = fixture(),
    reader = f.reader();
  await reader.refresh([f.agent], true);
  assert(C.isBackground(f.agent));
  assert.equal(C.modeOf(f.agent), 'background');
  assert.equal(agentLines(f.agent)[2], 'Bg task');
  assert(!JSON.stringify([...reader.cache]).includes('PRIVATE'));
  C.assertContext(
    { target: C.snapshot(f.agent) },
    { ...f.agent, backgroundOnly: undefined },
  );
  assert.throws(() =>
    C.assertContext(
      { target: f.agent },
      { ...f.agent, statusAt: 'v2', backgroundOnly: false },
    ),
  );
  const copy = { ...f.agent, statusAt: 'v2' };
  reader.hydrate([copy]);
  assert(
    !C.isBackground(copy),
    'new native activity invalidates cached background-only mode',
  );
  f.setTurn({ id: 'new-turn', status: 'inProgress' });
  await reader.refresh([f.agent], true);
  assert(!C.isBackground(f.agent));
  assert.equal(f.agent.runId, 'new-turn');
  const failed = fixture(),
    cache = failed.reader();
  await cache.refresh([failed.agent], true);
  cache.read = async () => {
    throw Error('Offline');
  };
  await cache.refresh([failed.agent], true);
  cache.hydrate([failed.agent]);
  assert(
    !C.isBackground(failed.agent),
    'failed refresh must disable destructive background action',
  );
  const ok = fixture();
  await ok.control().stop(ok.agent);
  assert.deepEqual(
    ok.calls
      .filter((x) => x.method.endsWith('/terminate'))
      .map((x) => x.params),
    [
      { threadId: id, processId: 'p1' },
      { threadId: id, processId: 'p2' },
    ],
  );
  assert(ok.rpc.closed);
  const duplicate = fixture();
  const stop = duplicate.control();
  duplicate.rpc.request = async (method, params) => {
    duplicate.calls.push({ method, params });
    if (method === 'thread/read') return { thread: duplicate.thread };
    if (method === 'thread/turns/list')
      return {
        data: [
          {
            id: 'turn',
            status: 'interrupted',
            itemsView: 'notLoaded',
            items: [],
          },
        ],
      };
    if (method.endsWith('/list'))
      return {
        data: [{ processId: 'p1' }, { processId: 'p2' }],
        nextCursor: null,
      };
    if (method.endsWith('/terminate')) throw Error('timeout');
    throw Error(method);
  };
  await assert.rejects(() => stop.stop(duplicate.agent), /timeout/);
  await assert.rejects(() => stop.stop(duplicate.agent), /already requested/);
  assert.equal(
    duplicate.calls.filter((c) => c.method.endsWith('/terminate')).length,
    1,
  );
  for (const change of [
    (f) => f.setTurn({ id: 'turn', status: 'inProgress' }),
    (f) => f.setTurn({ id: 'replacement', status: 'interrupted' }),
    (f) => f.setIds(['p1', 'new']),
    (f) => f.setFooter('other'),
    (f) => (f.thread.cwd = '/other'),
    (f) => (f.thread.status.activeFlags = ['waitingOnApproval']),
    (f) => (f.rpc.serverVersion = null),
    (f) =>
      (f.b.checked = async () => {
        throw Error('Focus changed');
      }),
  ]) {
    const x = fixture();
    change(x);
    await assert.rejects(() => x.control().stop(x.agent));
    assert(!x.calls.some((c) => c.method.endsWith('/terminate')));
    assert(x.rpc.closed);
  }
  const late = fixture(),
    original = late.rpc.request;
  late.rpc.request = async (m, p) => {
    const result = await original(m, p);
    if (m.endsWith('/terminate'))
      late.setTurn({ id: 'new', status: 'inProgress' });
    return result;
  };
  await assert.rejects(() => late.control().stop(late.agent));
  assert.equal(
    late.calls.filter((c) => c.method.endsWith('/terminate')).length,
    1,
    'new turn stops a partially completed batch',
  );
  const interrupt = fixture();
  await assert.rejects(
    () => interrupt.control().running(interrupt.agent),
    /background/,
  );
  interrupt.setTurn({ id: 'turn', status: 'inProgress' });
  assert.equal(
    (await interrupt.control().running(interrupt.agent)).runId,
    'turn',
  );
  const malformed = fixture();
  malformed.rpc.request = async () => ({
    data: [{ processId: 'same' }, { processId: 'same' }],
    nextCursor: null,
  });
  await assert.rejects(() => terminalIds(malformed.rpc, id));
  malformed.rpc.request = async () => ({ data: [], nextCursor: 'repeat' });
  await assert.rejects(() => terminalIds(malformed.rpc, id));
  const h = harness();
  await h.ready();
  h.change('a', {
    state: 'working',
    statusAt: 'bg',
    activityStatusAt: 'bg',
    backgroundOnly: true,
    backgroundIds: ['p1'],
    backgroundTurnId: 'turn',
  });
  await h.api.refresh();
  h.tick();
  assert.equal(h.action(2, 4), 'stopTerminals');
  // The Rex bar reports Rex's working state; daemon-only detail stays in row 3.
  assert(h.image(0, 0).includes('>Working<'));
  assert(h.image(2, 4).includes('>Stop<'));
  assert.match(h.image(2, 4), />\d+ terminals</);
  assert(!h.image(2, 0).includes('Steer'));
  const old = h.api.keys.get('2,4').presented;
  h.change('a', { statusAt: 'new' });
  await h.api.refresh();
  h.tick();
  const n = h.calls.length;
  await h.press(2, 4, old);
  assert.equal(h.calls.length, n);
  assert.equal(h.action(2, 4), 'interrupt');
  assert(h.image(2, 4).includes('Interrupt'));
  class Socket extends EventEmitter {
    readyState = 1;
    send(raw) {
      const m = JSON.parse(raw);
      if (m.id)
        setImmediate(() =>
          this.emit(
            'message',
            Buffer.from(JSON.stringify({ id: m.id, result: {} })),
          ),
        );
    }
    terminate() {}
  }
  const socket = new Socket(),
    rpc = new DaemonRpc('/fixture', () => socket);
  setImmediate(() => socket.emit('open'));
  await rpc.connect();
  for (const [method, params] of [
    ['clean', { threadId: id }],
    ['terminate', { threadId: id }],
    ['terminate', { threadId: id, processId: 'p1', all: true }],
    ['list', { threadId: id, limit: 100, includeOutput: true }],
    ['list', { threadId: 'wrong', limit: 100 }],
  ])
    await assert.rejects(() =>
      rpc.request('thread/backgroundTerminals/' + method, params),
    );
  for (const params of [
    { threadId: id },
    { threadId: id, turnId: '' },
    { threadId: id, turnId: 'turn', force: true },
    { threadId: 'wrong', turnId: 'turn' },
    { threadId: id, turnId: 'bad\nturn' },
    { threadId: id, turnId: 7 },
  ])
    await assert.rejects(() => rpc.request('turn/interrupt', params));
  await rpc.request('turn/interrupt', { threadId: id, turnId: 'turn' });
  await assert.rejects(() => rpc.request('turn/steer', { threadId: id }));
  await rpc.request('thread/backgroundTerminals/list', {
    threadId: id,
    limit: 100,
  });
  await rpc.request('thread/backgroundTerminals/terminate', {
    threadId: id,
    processId: 'p1',
  });
  rpc.close();
  console.log(
    'PASS background-only readback and privacy, interrupted/active distinction, fresh chat/turn/process/list checks, scoped terminal termination, partial batch/new-run refusal, no uncertain retries, stale cache/button rejection and strict RPC payloads',
  );
});

test('only the captured in-progress parent turn can be interrupted', async () => {
  const f = fixture();
  f.b.actionContext = { target: { chatId: id, runId: 'parent' } };
  f.setTurn({ id: 'parent', status: 'inProgress' });
  assert.equal((await f.control().running(f.agent)).runId, 'parent');
  for (const [turnId, status] of [
    ['parent', 'interrupted'],
    ['replacement', 'inProgress'],
    ['parent', 'failed'],
  ]) {
    f.setTurn({ id: turnId, status });
    await assert.rejects(f.control().running(f.agent));
  }
  assert(
    f.calls.every((call) =>
      ['thread/read', 'thread/turns/list'].includes(call.method),
    ),
  );
});

test('an API interrupt names the captured turn and is sent once', async () => {
  const f = fixture();
  const sent = () => f.calls.filter((c) => c.method === 'turn/interrupt');
  f.b.actionContext = { target: { chatId: id, runId: 'parent' } };
  f.setTurn({ id: 'parent', status: 'inProgress' });
  const mutations = [];
  f.b.deliverMutation = async (target, method, operation) => {
    mutations.push({ target, method });
    return operation(() => {});
  };
  assert.deepEqual(await f.control().interrupt(f.agent), {
    kind: 'interrupt',
    chatId: id,
    runId: 'parent',
  });
  assert.deepEqual(sent(), [
    { method: 'turn/interrupt', params: { threadId: id, turnId: 'parent' } },
  ]);
  assert.deepEqual(mutations, [{ target: f.agent, method: 'turn/interrupt' }]);
  // A second press for the same turn sends nothing.
  await assert.rejects(f.control().interrupt(f.agent), /already sent/);
  assert.equal(sent().length, 1);
});
test('an API interrupt refuses a changed turn, chat or daemon before writing', async () => {
  const cases = [
    (f) => f.setTurn({ id: 'replacement', status: 'inProgress' }),
    (f) => f.setTurn({ id: 'parent', status: 'interrupted' }),
    (f) => f.setTurn({ id: 'parent', status: 'completed' }),
    (f) => f.setFooter('11111111-1111-7111-8111-111111111111'),
    (f) => (f.thread.status = { type: 'idle' }),
    (f) =>
      (f.thread.status = {
        type: 'active',
        activeFlags: ['waitingOnApproval'],
      }),
    (f) => (f.thread.cwd = '/elsewhere'),
  ];
  for (const change of cases) {
    const f = fixture();
    f.b.actionContext = { target: { chatId: id, runId: 'parent' } };
    f.setTurn({ id: 'parent', status: 'inProgress' });
    change(f);
    await assert.rejects(f.control().interrupt(f.agent));
    assert(f.calls.every((c) => c.method !== 'turn/interrupt'));
    assert.equal(f.rpc.closed, true);
  }
  // The daemon was replaced between verification and the write.
  const f = fixture();
  f.b.actionContext = { target: { chatId: id, runId: 'parent' } };
  f.setTurn({ id: 'parent', status: 'inProgress' });
  let reads = 0;
  f.deps.socketFor = async () =>
    reads++ ? { pid: 51, socket: '/other' } : { pid: 50, socket: '/socket' };
  await assert.rejects(f.control().interrupt(f.agent), /Daemon changed/);
  assert(f.calls.every((c) => c.method !== 'turn/interrupt'));
});
test('an unconfirmed API interrupt is reported and never repeated', async () => {
  for (const reply of [null, undefined, 'ok', []]) {
    const f = fixture();
    f.b.actionContext = { target: { chatId: id, runId: 'parent' } };
    f.setTurn({ id: 'parent', status: 'inProgress' });
    f.setInterruptReply(reply);
    await assert.rejects(f.control().interrupt(f.agent), /unconfirmed/);
    await assert.rejects(f.control().interrupt(f.agent), /already sent/);
    assert.equal(
      f.calls.filter((c) => c.method === 'turn/interrupt').length,
      1,
    );
  }
});
test('Rex displays the bound Codex parent state across retry, compaction, child completion and terminal failure', async () => {
  const { rexDisplayAgent } = require('../../src/app/rex-provider-metadata');
  const f = fixture(),
    reader = f.reader();
  f.setIds([]);
  f.setTurn({ id: 'parent', status: 'inProgress' });
  // These unsolicited events share the socket with replies about the parent.
  class Socket extends EventEmitter {
    readyState = 1;
    send(raw) {
      const request = JSON.parse(raw);
      for (const frame of [
        {
          method: 'error',
          params: { threadId: id, turnId: 'parent', willRetry: true },
        },
        {
          method: 'item/completed',
          params: {
            threadId: id,
            turnId: 'parent',
            item: { type: 'contextCompaction' },
          },
        },
        {
          method: 'turn/completed',
          params: {
            threadId: 'child',
            turn: { id: 'child-turn', status: 'completed' },
          },
        },
      ])
        this.emit('message', Buffer.from(JSON.stringify(frame)));
      f.rpc
        .request(request.method, request.params)
        .then((result) =>
          this.emit(
            'message',
            Buffer.from(JSON.stringify({ id: request.id, result })),
          ),
        );
    }
    terminate() {}
  }
  const rpc = new DaemonRpc('/fixture', () => new Socket());
  rpc.serverVersion = '0.167.1';
  reader.connect = async () => rpc;
  const read = async () => {
    await reader.refresh([f.agent], true);
    return rexDisplayAgent(f.agent);
  };
  let a = await read();
  assert.equal(a.runId, 'parent');
  assert.equal(a.state, 'working');
  assert.equal(C.homeRow(a)[4], 'interrupt');
  f.thread.status.activeFlags = ['waitingOnUserInput'];
  a = await read();
  assert.equal(a.state, 'blocked');
  assert.deepEqual(C.homeRow(a), ['status', 'none', 'none', 'none', 'none']);
  f.thread.status.activeFlags = [];
  f.setTurn({ id: 'parent', status: 'failed' });
  a = await read();
  assert.equal(a.runId, null);
  assert.equal(a.state, 'error');
  f.setTurn({ id: 'parent', status: 'interrupted' });
  a = await read();
  assert.equal(a.state, 'unknown');
  f.setTurn({ id: 'next', status: 'inProgress' });
  a = await read();
  assert.equal(a.runId, 'next');
  assert.equal(a.state, 'working');
});
