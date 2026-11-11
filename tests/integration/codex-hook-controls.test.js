const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  fixture,
  id,
  session,
  block,
} = require('../helpers/codex-hook-fixture');
const {
  hookIdentity,
  readIdentity,
} = require('../../src/agents/codex/hook-identity');
const {
  readPrivate,
  writePrivate,
} = require('../../src/agents/codex/hook-files');
const { AgentMetadata } = require('../../src/agents/codex/metadata');
const {
  DaemonControls,
  permissionSnapshot,
} = require('../../src/agents/codex/daemon');
const { BackgroundControls } = require('../../src/agents/codex/background');
const { Bridge } = require('../../src/app/session');
const { snapshot } = require('../../src/guards/context');
const defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');

async function controlFixture(t, working = false) {
  const f = await fixture(t),
    native = [],
    requests = [];
  const state = {
    approvalsReviewer: 'user',
    model: 'first',
    modelProvider: 'openai',
    effort: 'high',
    cwd: '/fixture',
    approvalPolicy: 'on-request',
    sandboxPolicy: { type: 'workspaceWrite', networkAccess: false },
    activePermissionProfile: null,
    collaborationMode: {
      mode: 'default',
      settings: {
        model: 'first',
        reasoning_effort: 'high',
        developer_instructions: null,
      },
    },
    serviceTier: null,
    disabledPluginIds: [],
    multiAgentMode: 'explicitRequestOnly',
  };
  const rpc = {
    serverVersion: '0.167.1',
    settingsSequence: 0,
    event: null,
    watchSettings: () => rpc.settingsSequence,
    latestSettings: () => rpc.event,
    close() {},
    request: async (method, params) => {
      requests.push({ method, params });
      if (method === 'thread/loaded/list')
        return { data: [id], nextCursor: null };
      if (method === 'thread/read')
        return {
          thread: {
            id,
            name: 'Hook-bound chat',
            cwd: state.cwd,
            model: state.model,
            reasoningEffort: state.effort,
            status: { type: working ? 'active' : 'idle', activeFlags: [] },
          },
        };
      if (method === 'thread/turns/list')
        return {
          data: [
            {
              id: 'turn-1',
              status: working ? 'inProgress' : 'completed',
              items: [],
              itemsView: 'notLoaded',
            },
          ],
        };
      if (method === 'thread/resume')
        return {
          ...structuredClone(state),
          thread: { id, turns: [] },
          sandbox: state.sandboxPolicy,
          reasoningEffort: state.effort,
        };
      if (method === 'model/list')
        return {
          data: ['first', 'second'].map((model) => ({
            model,
            displayName: model,
            hidden: false,
            supportedReasoningEfforts: ['low', 'high', 'xhigh'].map(
              (reasoningEffort) => ({ reasoningEffort }),
            ),
          })),
        };
      if (method === 'thread/settings/update') {
        if (params.model) state.model = params.model;
        if (params.effort) {
          state.effort = params.effort;
          state.collaborationMode.settings.reasoning_effort = params.effort;
        }
        if (params.approvalsReviewer)
          state.approvalsReviewer = params.approvalsReviewer;
        rpc.event = {
          sequence: ++rpc.settingsSequence,
          state: permissionSnapshot(state, false),
        };
        return {};
      }
      throw Error('Unexpected fixture RPC');
    },
  };
  const identity = (bridge, agent) =>
    readIdentity(bridge, agent, {
      hook: (agent) => hookIdentity(agent, f.ports),
      footer: async () => {
        assert.fail('A verified hook must never read a status-line footer');
      },
    });
  const bridge = new Bridge(
    { ...structuredClone(defaults), allowClipboardFocus: true },
    async (args) => {
      native.push(args);
      if (args[0] === 'client')
        return {
          clients: [
            {
              client_id: 'fixture-client',
              info: { kind: 'app', platform: 'macos', name: 'Rex Beta' },
              connection_state: 'connected',
            },
          ],
        };
      if (args[0] === 'ls') return { sessions: [{ session_id: session }] };
      if (args[0] === 'session')
        return {
          windows: [
            {
              window_id: 'fixture-window',
              layers: [
                {
                  blocks: [
                    {
                      block_id: block,
                      creator_name: 'com.superlogical.terminal',
                    },
                  ],
                },
              ],
            },
          ],
        };
      if (args[6] === 'process')
        return {
          foreground: {
            pid: 42,
            user_id: process.getuid(),
            name: 'codex',
            path: '/fixture/codex',
            cwd: '/fixture',
          },
        };
      if (args[6] === 'program_status')
        return {
          records: [
            {
              app: 'codex',
              state: working ? 'working' : 'idle',
              owner: { pid: 42, name: 'codex' },
              updated_at: new Date().toISOString(),
            },
          ],
        };
      if (args[0] === 'send-key') return {};
      throw Error('No terminal captures or other native operations allowed');
    },
    async () => assert.fail('No app activation'),
    async () => block,
    identity,
  );
  const deps = {
    footer: identity,
    socketFor: async () => ({ pid: 80, socket: '/fixture/daemon.sock' }),
    connect: async () => rpc,
  };
  const metadata = new AgentMetadata(bridge, {
    ...deps,
    settings: async () => permissionSnapshot(state, false),
  });
  await bridge.discover();
  await metadata.refresh(bridge.agents);
  const target = snapshot(bridge.agents[0]);
  assert.equal(target.chatId, id);
  assert(target.codexHookEpoch);
  const controls = new DaemonControls(bridge, deps);
  bridge.verifyRunning = (agent) =>
    new BackgroundControls(bridge, deps).running(agent);
  return {
    ...f,
    bridge,
    target,
    rpc,
    native,
    requests,
    controls,
    metadata,
    state,
  };
}

for (const [action, method, expected] of [
  ['model', 'cycle', { threadId: id, model: 'second' }],
  ['effort', 'cycleEffort', { threadId: id, effort: 'xhigh' }],
  [
    'permissions',
    'cyclePermissions',
    { threadId: id, approvalsReviewer: 'auto_review' },
  ],
])
  test(`hook-bound ${action} uses real Rex focus and provider guards without a footer`, async (t) => {
    const f = await controlFixture(t);
    await f.bridge.withContext(
      { target: f.target, action, verifyChat: true },
      () => f.controls[method](f.bridge.agents[0]),
    );
    assert.deepEqual(
      f.requests
        .filter(({ method }) => method === 'thread/settings/update')
        .map(({ params }) => params),
      [expected],
    );
    assert(
      !f.native.some(
        (args) =>
          ['send', 'send-key', 'format'].includes(args[0]) ||
          args[6] === 'format',
      ),
    );
  });

test('hook-bound Interrupt and Mode use exact native keys after real focus checks', async (t) => {
  const working = await controlFixture(t, true);
  await working.bridge.withContext(
    { target: working.target, action: 'interrupt', verifyChat: true },
    () => working.bridge.interrupt(),
  );
  assert.deepEqual(
    working.native.filter((args) => args[0] === 'send-key'),
    [['send-key', '-s', session, '-b', block, 'escape']],
  );
  const ready = await controlFixture(t);
  await ready.bridge.withContext(
    { target: ready.target, action: 'plan', verifyChat: true },
    () => ready.bridge.togglePlan(),
  );
  assert.deepEqual(
    ready.native.filter((args) => args[0] === 'send-key'),
    [['send-key', '-s', session, '-b', block, 'shift+tab']],
  );
});

test('a fresh hook report invalidates a captured control before any provider write', async (t) => {
  const f = await controlFixture(t);
  writePrivate(f.recordFile, {
    ...readPrivate(f.recordFile),
    epoch: randomUUID(),
  });
  await assert.rejects(
    f.bridge.withContext(
      { target: f.target, action: 'model', verifyChat: true },
      () => f.controls.cycle(f.bridge.agents[0]),
    ),
    /hook changed/,
  );
  assert(!f.requests.some(({ method }) => method === 'thread/settings/update'));
  assert(!f.native.some((args) => args[0] === 'send-key'));
});

test('fresh discovery and metadata hydration preserve the hook epoch for stale-press checks', async (t) => {
  const f = await controlFixture(t);
  await f.bridge.discover();
  assert.equal(f.bridge.agents[0].codexHookEpoch, undefined);
  f.metadata.hydrate(f.bridge.agents);
  assert.equal(f.bridge.agents[0].codexHookEpoch, f.target.codexHookEpoch);
  assert.equal(f.bridge.agents[0].chatId, id);
});
