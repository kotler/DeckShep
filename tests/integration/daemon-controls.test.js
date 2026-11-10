'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  DaemonControls,
  DaemonRpc,
  socketFromListing,
  footerId,
  readFooter,
  availableModels,
  nextModel,
} = require('../../src/agents/codex/daemon');
const id = '01a1ae31-d050-7503-afec-fd2b40d2bc26',
  other = '01a1ae31-f4ee-7212-b16a-f3b61ddf3688';
const models = [
  {
    model: 'first',
    displayName: 'First',
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low' },
      { reasoningEffort: 'high' },
    ],
  },
  {
    model: 'second',
    displayName: 'Second',
    hidden: false,
    supportedReasoningEfforts: [{ reasoningEffort: 'high' }],
  },
  { model: 'hidden', hidden: true, supportedReasoningEfforts: [] },
];
function fixture() {
  const calls = [],
    agent = { pid: 42, cwd: '/project' },
    endpoint = { pid: 50, socket: '/socket' };
  let current = {
    id,
    model: 'first',
    reasoningEffort: 'high',
    cwd: '/project',
    status: { type: 'idle' },
  };
  const rpc = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === 'thread/loaded/list') return { data: [id, other] };
      if (method === 'thread/read') return { thread: { ...current } };
      if (method === 'model/list') return { data: models };
      if (method === 'thread/settings/update') {
        current = { ...current, model: params.model };
        return {};
      }
      throw Error('Unexpected method');
    },
    close: () => {
      rpc.closed = true;
    },
  };
  const b = { config: {}, draft: { unsent: true }, checked: async () => agent };
  b.deliverMutation = async (_target, _method, operation) => operation();
  const deps = {
    socketFor: async () => endpoint,
    footer: async () => id,
    connect: async () => rpc,
  };
  return {
    calls,
    agent,
    rpc,
    b,
    deps,
    setCurrent: (x) => (current = { ...current, ...x }),
    control: () => new DaemonControls(b, deps),
  };
}
test('daemon controls', async () => {
  const listing =
    'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\ncodex 42 user 9u unix 0xaaa 0t0 ->0xbbb\ncodex 50 user 8u unix 0xbbb 0t0 /private/tmp/daemon/socket\n';
  assert.deepEqual(socketFromListing(listing, 42), {
    pid: 50,
    socket: '/private/tmp/daemon/socket',
  });
  assert.throws(() => socketFromListing(listing, 99));
  assert.throws(() =>
    socketFromListing(
      listing + 'codex 51 user 8u unix 0xbbb 0t0 /another/socket\n',
      42,
    ),
  );
  assert.equal(
    footerId('draft ' + other + '\n\n  ' + id + ' · GPT-6-Sol high\n', 1),
    id,
  );
  assert.throws(() => footerId('  ' + other + '\nmenu dialog\n', 1));
  assert.throws(() => footerId('  ' + id, 2));
  assert.equal(
    footerId('composer\n\n  ' + id + ' · GPT-6-Sol high\nshift-tab plan', 1),
    id,
  );
  // Redraws can temporarily hide the footer, or mix text with an older cursor.
  function footerBridge(frames, views) {
    let vt = 0,
      text = 0;
    return {
      method: async () => ({ rows: 6 }),
      run: async (args) => {
        const format = JSON.parse(args.at(-1)).format;
        return {
          content:
            format === 'vt'
              ? frames[Math.min(vt++, frames.length - 1)]
              : views[Math.min(text++, views.length - 1)],
        };
      },
    };
  }
  const stable = 'screen\x1b[1;3H',
    visible = '› draft\n\n  ' + id + ' · GPT-6-Sol max\n? for shortcuts';
  assert.equal(
    await readFooter(footerBridge([stable], ['redrawing', visible]), {
      session: 's',
      block: 'b',
    }),
    id,
    'retry a missing footer during redraw',
  );
  assert.equal(
    await readFooter(
      footerBridge(
        [stable],
        [
          ...Array(7).fill(
            '› draft\n\n              U  L  T  R  A\n? for shortcuts',
          ),
          visible,
        ],
      ),
      { session: 's', block: 'b' },
    ),
    id,
    'wait through native Max/Ultra animation without accepting an unverified chat',
  );
  assert.equal(
    await readFooter(
      footerBridge(
        ['old\x1b[6;3H', stable, stable, stable],
        [visible, visible],
      ),
      { session: 's', block: 'b' },
    ),
    id,
    'reject mismatched cursor/text snapshot then read again',
  );
  // A stable screen with no session-ID footer gets its own short code, so
  // keys can say "No footer ID" instead of a truncated generic error.
  await assert.rejects(
    () => readFooter(footerBridge([stable], ['no footer']), {}),
    (error) =>
      error.code === 'FOOTER_MISSING' && error.message === 'No footer ID',
  );
  assert.throws(
    () => footerId('composer\nmenu dialog\n', 1),
    (error) => error.code === 'FOOTER_MISSING',
  );
  assert.throws(
    () => footerId('  ' + id + ' · GPT-6-Sol high\ninput', 1),
    (error) => error.code === undefined,
    'a footer in the wrong place is not reported as missing',
  );
  await assert.rejects(
    () =>
      readFooter(
        footerBridge([stable], ['  ' + id + ' · GPT-6-Sol max\ninput']),
        {},
      ),
    /Session footer unavailable/,
    'never accept footer above cursor or in its immediate input row',
  );
  const f = fixture(),
    draft = f.b.draft;
  const catalog = await availableModels(f.rpc);
  assert.deepEqual(
    catalog.map((m) => m.id),
    ['first', 'second'],
  );
  assert.equal(
    nextModel({ model: 'second', effort: 'high' }, catalog).id,
    'first',
  );
  assert.equal(
    nextModel({ model: 'second', effort: 'low' }, catalog).id,
    'first',
  );
  assert.throws(() =>
    nextModel({ model: 'first', effort: 'unsupported' }, catalog),
  );
  f.calls.length = 0;
  assert.equal((await f.control().cycle(f.agent)).label, 'Second');
  assert.deepEqual(
    f.calls.find((c) => c.method === 'thread/settings/update').params,
    { threadId: id, model: 'second' },
  );
  assert.equal(f.b.draft, draft);
  assert(f.rpc.closed);
  // A manual model change is read on the following press, with no cycle index.
  const manual = fixture();
  manual.setCurrent({ model: 'second' });
  assert.equal((await manual.control().cycle(manual.agent)).label, 'First');
  for (const change of [
    (x) => {
      x.b.checked = async () => {
        throw Error('Focus changed');
      };
    },
    (x) => {
      let n = 0;
      x.deps.footer = async () => (++n === 1 ? id : other);
    },
    (x) => {
      let n = 0;
      x.deps.socketFor = async () => ({
        pid: ++n === 1 ? 50 : 51,
        socket: '/socket',
      });
    },
    (x) => x.setCurrent({ status: { type: 'active' } }),
    (x) => x.setCurrent({ cwd: '/another-project' }),
    (x) => {
      const request = x.rpc.request;
      x.rpc.request = async (m, p) => {
        const r = await request(m, p);
        if (m === 'model/list') x.setCurrent({ reasoningEffort: 'low' });
        return r;
      };
    },
    (x) => {
      const request = x.rpc.request;
      x.rpc.request = async (m, p) =>
        m === 'thread/loaded/list' ? { data: [] } : request(m, p);
    },
  ]) {
    const x = fixture();
    change(x);
    await assert.rejects(() => x.control().cycle(x.agent));
    assert(!x.calls.some((c) => c.method === 'thread/settings/update'));
    assert(x.rpc.closed);
  }
  const timeout = fixture(),
    request = timeout.rpc.request;
  timeout.rpc.request = async (m, p) => {
    if (m === 'thread/settings/update') {
      timeout.calls.push({ method: m, params: p });
      throw Error('timeout');
    }
    return request(m, p);
  };
  await assert.rejects(() => timeout.control().cycle(timeout.agent));
  assert.equal(
    timeout.calls.filter((c) => c.method === 'thread/settings/update').length,
    1,
  );
  // Exercise the actual RPC dispatcher without executing Codex or touching a user socket.
  class FakeSocket extends EventEmitter {
    readyState = 1;
    frames = [];
    send(raw) {
      const m = JSON.parse(raw);
      this.frames.push(m);
      if (m.id)
        setImmediate(() =>
          this.emit(
            'message',
            Buffer.from(
              JSON.stringify(
                m.method === 'thread/read'
                  ? { id: m.id, error: { message: 'private data' } }
                  : { id: m.id, result: {} },
              ),
            ),
          ),
        );
    }
    terminate() {
      this.emit('close');
    }
  }
  const socket = new FakeSocket(),
    rpc = new DaemonRpc('/unused', () => socket);
  setImmediate(() => socket.emit('open'));
  await rpc.connect();
  await assert.rejects(
    () => rpc.request('thread/read', {}),
    (e) => !e.message.includes('private data'),
  );
  await assert.rejects(() =>
    rpc.request('thread/settings/update', { threadId: id }),
  );
  await assert.rejects(() =>
    rpc.request('thread/settings/update', {
      threadId: id,
      model: 'first',
      approvalsReviewer: 'auto_review',
    }),
  );
  assert(!socket.frames.some((m) => m.method === 'thread/settings/update'));
  await rpc.request('thread/settings/update', {
    threadId: id,
    model: 'second',
  });
  for (const params of [
    { threadId: id, limit: 1, sortDirection: 'desc', itemsView: 'full' },
    { threadId: id, limit: 20, sortDirection: 'desc', itemsView: 'notLoaded' },
  ])
    await assert.rejects(() => rpc.request('thread/turns/list', params));
  await rpc.request('thread/turns/list', {
    threadId: id,
    limit: 1,
    sortDirection: 'desc',
    itemsView: 'notLoaded',
  });
  await assert.rejects(() => rpc.request('turn/start', {}));
  assert(!socket.frames.some((m) => m.method === 'turn/start'));
  rpc.close();
  console.log(
    'PASS daemon socket routing, footer identity, catalog/effort compatibility, manual synchronization, focus/chat/process changes, busy/offline guards, model-only writes, no timeout retries and RPC dispatch',
  );
});
