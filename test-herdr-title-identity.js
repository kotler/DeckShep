'use strict';
const assert = require('node:assert/strict'),
  {
    TitleIdentity,
    titlePrefix,
  } = require('./com.local.rexagents.sdPlugin/herdr-title-identity');
const id = '01a1ae31-d050-7503-afec-fd2b40d2bc26',
  title = id.slice(0, 29) + '...';
function fixture() {
  const state = {
    ids: [id],
    next: null,
    calls: [],
    thread: {
      id,
      cwd: '/project',
      parentThreadId: null,
      source: 'cli',
      status: { type: 'idle' },
      preview: 'PRIVATE_BODY',
    },
    version: '0.167.0',
    socketGeneration: 'one',
    lookups: 0,
    closed: 0,
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      itemsView: 'notLoaded',
      items: [],
    },
  };
  const resolver = new TitleIdentity({
    socketFor: async () => {
      if (++state.lookups === 2 && state.replace)
        state.socketGeneration = 'two';
      return { pid: 700, socket: '/fixture.sock' };
    },
    socketIdentity: () => state.socketGeneration,
    connect: async () => ({
      serverVersion: state.version,
      close() {
        state.closed++;
      },
      request: async (method, params) => {
        state.calls.push({ method, params });
        if (method === 'thread/loaded/list')
          return { data: state.ids, nextCursor: state.next };
        if (method === 'thread/read')
          return { thread: structuredClone(state.thread) };
        if (method === 'thread/turns/list')
          return { data: state.turn ? [state.turn] : [] };
        if (method === 'thread/backgroundTerminals/list')
          return { data: [], nextCursor: null };
        throw Error('Unexpected request ' + method);
      },
    }),
  });
  return {
    state,
    resolver,
    run: () => resolver.resolve({ pid: 101, cwd: '/project' }, title),
  };
}
(async () => {
  assert.equal(titlePrefix(title), id.slice(0, 29));
  assert.equal(titlePrefix(id), id);
  for (const value of [
    null,
    '',
    title + ' ',
    title + ' | project',
    'Name ' + title,
    title.replace('...', '…'),
    id.slice(0, 20) + '...',
    id.toUpperCase(),
    'Chat named ' + id,
  ])
    assert.throws(() => titlePrefix(value));
  const f = fixture(),
    binding = await f.run();
  assert.equal(binding.chatId, id);
  assert.equal(binding.nativeIdentity, 'one');
  assert(!JSON.stringify(binding).includes('PRIVATE'));
  assert.equal(f.state.closed, 1);
  assert(
    f.state.calls.every(
      (c) => !c.method.includes('update') && !c.method.includes('resume'),
    ),
  );
  assert.deepEqual(
    f.state.calls.find((c) => c.method === 'thread/read').params,
    { threadId: id, includeTurns: false },
  );
  for (const alter of [
    (s) => (s.ids = []),
    (s) => (s.ids = [id, id.slice(0, -1) + '7']),
    (s) => (s.ids = [id, id]),
    (s) => (s.ids = ['not-a-uuid']),
    (s) => (s.next = 'repeat'),
    (s) => delete s.next,
    (s) => (s.thread.id = id.slice(0, -1) + '7'),
    (s) => (s.thread.cwd = '/elsewhere'),
    (s) => (s.thread.parentThreadId = 'parent'),
    (s) => delete s.thread.parentThreadId,
    (s) => (s.thread.source = { subagent: { other: 'guardian' } }),
    (s) => (s.thread.source = 'exec'),
    (s) => (s.version = '0.168.0'),
    (s) => (s.replace = true),
    (s) => (s.thread.status = { type: 'active', activeFlags: ['unknown'] }),
    (s) => {
      s.thread.status = { type: 'active', activeFlags: [] };
      s.turn = null;
    },
  ]) {
    const x = fixture();
    alter(x.state);
    await assert.rejects(x.run);
    assert.equal(x.state.closed, 1);
    assert(!x.state.calls.some((c) => c.method.includes('update')));
  }
  const pages = fixture();
  pages.state.next = 'page-two';
  let count = 0;
  pages.resolver.connect = async () => ({
    serverVersion: '0.167.0',
    close() {},
    request: async (method) => {
      if (method === 'thread/loaded/list')
        return ++count === 1
          ? { data: [id], nextCursor: 'page-two' }
          : { data: [id.slice(0, -1) + '7'], nextCursor: null };
      throw Error('Should not read ambiguous thread');
    },
  });
  await assert.rejects(pages.run, /multiple/);
  const running = fixture();
  running.state.thread.status = { type: 'active', activeFlags: [] };
  assert.equal((await running.run()).status.runId, 'turn-1');
  const waiting = fixture();
  waiting.state.thread.status = {
    type: 'active',
    activeFlags: ['waitingOnApproval'],
  };
  assert.deepEqual((await waiting.run()).status, waiting.state.thread.status);
  const desktop = fixture();
  desktop.state.thread.source = 'vscode';
  assert.equal((await desktop.run()).chatId, id);
  console.log(
    'PASS explicit native UUID titles, complete unique loaded-ID matching, root/cwd/source checks, daemon generation, active-turn identity, malformed/paginated/ambiguous refusal and metadata-only reads',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
