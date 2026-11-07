'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  DaemonControls,
  DaemonRpc,
  permissionSnapshot,
  sameOtherSettings,
} = require('../../com.local.rexagents.sdPlugin/daemon-controls');
const id = '01a1ae31-d050-7503-afec-fd2b40d2bc26',
  other = '01a1ae31-f4ee-7212-b16a-f3b61ddf3688';
function fixture() {
  let state = {
    approvalsReviewer: 'user',
    model: 'test-model',
    modelProvider: 'openai',
    effort: 'high',
    cwd: '/project',
    approvalPolicy: {
      granular: { sandbox_approval: true, request_permissions: true },
    },
    sandboxPolicy: {
      type: 'workspaceWrite',
      writableRoots: ['/project'],
      networkAccess: false,
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    },
    activePermissionProfile: { id: ':workspace' },
    collaborationMode: {
      mode: 'plan',
      settings: {
        model: 'test-model',
        reasoning_effort: 'high',
        developer_instructions: null,
      },
    },
    serviceTier: null,
    disabledPluginIds: ['disabled'],
    multiAgentMode: 'explicitRequestOnly',
  };
  const calls = [],
    agent = { pid: 42, cwd: '/project' },
    endpoint = { pid: 50, socket: '/socket' },
    b = { config: {}, checked: async () => agent, draft: { unsent: true } };
  const rpc = {
    serverVersion: '0.166.0',
    settingsSequence: 0,
    event: null,
    watchSettings: () => rpc.settingsSequence,
    latestSettings: () => rpc.event,
    close: () => (rpc.closed = true),
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === 'thread/loaded/list') return { data: [id] };
      if (method === 'thread/read')
        return {
          thread: {
            id,
            model: state.model,
            reasoningEffort: state.effort,
            cwd: state.cwd,
            status: { type: 'idle' },
          },
        };
      if (method === 'thread/resume') {
        const result = structuredClone(state);
        result.thread = { id, turns: [] };
        result.sandbox = result.sandboxPolicy;
        result.reasoningEffort = result.effort;
        return result;
      }
      if (method === 'thread/settings/update') {
        state = { ...state, approvalsReviewer: params.approvalsReviewer };
        rpc.event = {
          sequence: ++rpc.settingsSequence,
          state: permissionSnapshot(state, false),
        };
        return {};
      }
      throw Error('Unexpected method');
    },
  };
  const deps = {
    socketFor: async () => endpoint,
    footer: async () => id,
    connect: async () => rpc,
  };
  return {
    calls,
    agent,
    b,
    rpc,
    deps,
    get: () => structuredClone(state),
    set: (patch) => (state = { ...state, ...patch }),
    control: () => new DaemonControls(b, deps),
  };
}
test('daemon permissions', async () => {
  const f = fixture(),
    before = permissionSnapshot(f.get(), false),
    draft = f.b.draft;
  assert.equal(
    (await f.control().cyclePermissions(f.agent)).label,
    'Approve for me',
  );
  assert.equal(f.b.lastReviewer.reviewer, 'auto_review');
  assert.equal(f.b.lastReviewer.chatId, id);
  assert(sameOtherSettings(before, permissionSnapshot(f.get(), false)));
  assert.equal(f.b.draft, draft);
  assert(f.rpc.closed);
  assert.deepEqual(
    f.calls.find((c) => c.method === 'thread/settings/update').params,
    { threadId: id, approvalsReviewer: 'auto_review' },
  );
  assert(
    f.calls
      .filter((c) => c.method === 'thread/resume')
      .every(
        (c) =>
          Object.keys(c.params).sort().join(',') === 'excludeTurns,threadId' &&
          c.params.excludeTurns === true,
      ),
  );
  const manual = fixture();
  manual.set({ approvalsReviewer: 'auto_review' });
  assert.equal(
    (await manual.control().cyclePermissions(manual.agent)).label,
    'Ask me',
  );
  const updatedDaemon = fixture();
  updatedDaemon.rpc.serverVersion = '0.167.0';
  assert.equal(
    (await updatedDaemon.control().cyclePermissions(updatedDaemon.agent)).label,
    'Approve for me',
  );
  assert.throws(() =>
    permissionSnapshot({ ...f.get(), approvalsReviewer: 'unknown' }, false),
  );
  assert.throws(() =>
    permissionSnapshot({ ...f.get(), sandboxPolicy: null }, false),
  );
  const changed = {
    ...before,
    sandboxPolicy: { ...before.sandboxPolicy, networkAccess: true },
  };
  assert(!sameOtherSettings(before, changed));
  for (const change of [
    (x) => {
      x.rpc.serverVersion = '0.168.0';
    },
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
    (x) => x.set({ cwd: '/other' }),
    (x) => {
      const request = x.rpc.request;
      x.rpc.request = async (m, p) => {
        if (m === 'thread/resume') {
          const e = Error('no rollout');
          e.kind = 'NO_ROLLOUT';
          throw e;
        }
        return request(m, p);
      };
    },
    (x) => {
      const request = x.rpc.request;
      x.rpc.request = async (m, p) => {
        const r = await request(m, p);
        if (m === 'thread/resume') r.thread.turns = [{ private: 'not read' }];
        return r;
      };
    },
    (x) => {
      let resumes = 0;
      const request = x.rpc.request;
      x.rpc.request = async (m, p) => {
        if (m === 'thread/resume' && ++resumes === 2)
          x.set({ approvalPolicy: 'never' });
        return request(m, p);
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
    await assert.rejects(() => x.control().cyclePermissions(x.agent));
    assert(!x.calls.some((c) => c.method === 'thread/settings/update'));
    assert(x.rpc.closed);
  }
  for (const change of [
    (x) => {
      const request = x.rpc.request;
      x.rpc.request = async (m, p) => {
        if (m === 'thread/settings/update') {
          x.calls.push({ method: m, params: p });
          throw Error('timeout');
        }
        return request(m, p);
      };
    },
    (x) => {
      const request = x.rpc.request;
      x.rpc.request = async (m, p) => {
        const r = await request(m, p);
        if (m === 'thread/settings/update')
          x.rpc.event.state.sandboxPolicy.networkAccess = true;
        return r;
      };
    },
    (x) => {
      const request = x.rpc.request;
      x.rpc.request = async (m, p) => {
        const r = await request(m, p);
        if (m === 'thread/settings/update') x.rpc.event.state.reviewer = 'user';
        return r;
      };
    },
  ]) {
    const x = fixture();
    change(x);
    await assert.rejects(() => x.control().cyclePermissions(x.agent));
    assert.equal(
      x.calls.filter((c) => c.method === 'thread/settings/update').length,
      1,
    );
    assert(x.rpc.closed);
  }
  class Socket extends EventEmitter {
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
              JSON.stringify({
                id: m.id,
                result:
                  m.method === 'initialize'
                    ? { userAgent: 'codex-tui/0.166.0 (test)' }
                    : {},
              }),
            ),
          ),
        );
    }
    terminate() {
      this.emit('close');
    }
  }
  const socket = new Socket(),
    rpc = new DaemonRpc('/unused', () => socket);
  setImmediate(() => socket.emit('open'));
  await rpc.connect();
  assert.equal(rpc.serverVersion, '0.166.0');
  for (const params of [
    { threadId: id },
    { threadId: id, approvalsReviewer: 'never' },
    { threadId: id, approvalsReviewer: 'user', sandboxPolicy: {} },
    { threadId: id, approvalsReviewer: 'user', approvalPolicy: 'never' },
    { threadId: id, permissions: ':danger-full-access' },
  ])
    await assert.rejects(() => rpc.request('thread/settings/update', params));
  await assert.rejects(() =>
    rpc.request('thread/resume', { threadId: id, excludeTurns: false }),
  );
  await assert.rejects(() =>
    rpc.request('thread/resume', {
      threadId: id,
      excludeTurns: true,
      model: 'another',
    }),
  );
  await rpc.request('thread/settings/update', {
    threadId: id,
    approvalsReviewer: 'auto_review',
  });
  rpc.watchSettings(id);
  socket.emit(
    'message',
    Buffer.from(
      JSON.stringify({
        method: 'thread/settings/updated',
        params: { threadId: id, threadSettings: f.get() },
      }),
    ),
  );
  assert.equal(rpc.latestSettings(id).state.reviewer, 'auto_review');
  socket.emit(
    'message',
    Buffer.from(
      JSON.stringify({
        method: 'thread/settings/updated',
        params: { threadId: other, threadSettings: f.get() },
      }),
    ),
  );
  assert.equal(rpc.latestSettings(other), null);
  rpc.close();
  assert.equal(rpc.settingsByThread.size, 0);
  console.log(
    'PASS live reviewer toggles/manual changes, exact reviewer-only payloads, full boundary preservation, metadata-only subscriptions, empty-history/version/focus guards, no timeout retries, authoritative confirmation and snapshot cleanup',
  );
});
