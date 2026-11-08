const { test } = require('node:test'),
  assert = require('node:assert/strict');
const I = require('../../src/agents/codex/native-input');
const agent = {
  session: 'fixture',
  block: 'fixture',
  pid: 42,
  app: 'codex',
  name: 'codex',
  cwd: '/fixture',
};
const chat = '11111111-1111-1111-1111-111111111111';
function fixture({ active = false } = {}) {
  let closed = 0,
    footers = 0,
    views = 0;
  const state = {
    thread: {
      id: chat,
      cwd: '/fixture',
      status: active ? { type: 'active', activeFlags: [] } : { type: 'idle' },
    },
    data: [
      {
        id: 'turn',
        status: active ? 'inProgress' : 'completed',
        itemsView: 'notLoaded',
        items: [],
        startedAt: 1,
        completedAt: 2,
      },
    ],
    vt: 'native\x1b[1;8H',
    changed: false,
    footerChanged: false,
    content: '› hello\n' + chat + ' · model',
  };
  const bridge = {
    actionContext: { target: { runId: 'turn' } },
    async method() {
      return { rows: 30 };
    },
    async run(args) {
      const format = JSON.parse(args.at(-1));
      if (format.format === 'text') return { content: state.content };
      views++;
      return {
        content: state.vt + (state.changed && views > 1 ? 'changed' : ''),
      };
    },
  };
  const ports = {
    footer: async () => {
      footers++;
      return state.footerChanged && footers > 1 ? 'changed' : chat;
    },
    endpoint: async () => ({ socket: '/fixture-only' }),
    open: () => ({
      async connect() {},
      async request(method) {
        return method === 'thread/read'
          ? { thread: state.thread }
          : { data: state.data };
      },
      close() {
        closed++;
      },
    }),
  };
  return { state, bridge, ports, closed: () => closed };
}
test('idle composer reads bind exact native thread, finished turn, stable view/cursor and rechecked footer', async () => {
  const f = fixture(),
    snapshot = await I.readIdleComposer(f.bridge, agent, {}, f.ports);
  assert.equal(snapshot.chatId, chat);
  assert.equal(snapshot.empty, false);
  assert.match(snapshot.hash, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.turnStamp, '["turn","completed",1,2]');
  assert.equal(f.closed(), 1);
  assert(!JSON.stringify(snapshot).includes('hello'));
  const empty = fixture();
  empty.state.data = [];
  empty.state.content = '› \n' + chat + ' · model';
  empty.state.vt = 'native\x1b[1;3H';
  assert.equal(
    (
      await I.readIdleComposer(
        empty.bridge,
        agent,
        { allowEmpty: true },
        empty.ports,
      )
    ).turnStamp,
    'no-turn',
  );
  for (const alter of [
    (f) => (f.state.thread.id = 'changed'),
    (f) => (f.state.thread.cwd = '/other'),
    (f) => (f.state.thread.status.type = 'active'),
    (f) => f.state.data.push({}),
    (f) => (f.state.data[0].status = 'inProgress'),
    (f) => f.state.data[0].items.push({}),
    (f) => (f.state.data = null),
    (f) => (f.state.changed = true),
    (f) => (f.state.footerChanged = true),
    (f) => (f.state.vt = 'no cursor'),
  ]) {
    const f = fixture();
    alter(f);
    await assert.rejects(I.readIdleComposer(f.bridge, agent, {}, f.ports));
    assert.equal(f.closed(), 1);
  }
  await assert.rejects(
    I.readIdleComposer({}, { ...agent, app: 'claude-code' }, {}, {}),
    /Codex only/,
  );
});
test('running composer requires clean active native flags and the exact in-progress run; approval snapshot contains a digest only', async () => {
  const f = fixture({ active: true }),
    result = await I.readComposer(f.bridge, agent, f.ports);
  assert.equal(result.runId, 'turn');
  assert.equal(f.closed(), 1);
  for (const alter of [
    (f) => f.state.thread.status.activeFlags.push('blocked'),
    (f) => (f.state.thread.status.type = 'idle'),
    (f) => (f.state.data[0].status = 'completed'),
    (f) => (f.state.data[0].itemsView = 'loaded'),
    (f) => f.state.data[0].items.push({}),
    (f) => (f.bridge.actionContext.target.runId = 'changed'),
    (f) => (f.state.vt = 'no cursor'),
  ]) {
    const f = fixture({ active: true });
    alter(f);
    await assert.rejects(I.readComposer(f.bridge, agent, f.ports));
    assert.equal(f.closed(), 1);
  }
  const digest = await I.requestSnapshot(
    { run: async () => ({ content: 'private approval text' }) },
    agent,
  );
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert(!digest.includes('private'));
  for (const reply of [
    { id: 'truncated', content: 'view' },
    {},
    { content: '' },
  ])
    await assert.rejects(I.requestSnapshot({ run: async () => reply }, agent));
});
