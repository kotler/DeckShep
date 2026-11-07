'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  { HerdrBridge } = require('../../com.local.rexagents.sdPlugin/herdr-bridge'),
  D = require('../../com.local.rexagents.sdPlugin/daemon-controls'),
  C = require('../../com.local.rexagents.sdPlugin/context-controls');
const defaults = require('../../com.local.rexagents.sdPlugin/config.json'),
  id = '01a1ae31-d050-7503-afec-fd2b40d2bc26';
function fixture() {
  const infos = [1, 2].map((i) => ({
    agent: 'codex',
    pane_id: 'w1:p' + i,
    terminal_id: 'term-' + i,
    workspace_id: 'w1',
    tab_id: 'w1:t' + i,
    revision: 1,
    state_change_seq: 1,
    agent_status: 'idle',
    foreground_cwd: '/project',
    agent_session: {
      source: 'herdr:codex',
      agent: 'codex',
      kind: 'id',
      value: id,
    },
    title: 'Chat ' + i,
    name: 'Agent ' + i,
    terminal_title_stripped: id.slice(0, 29) + '...',
    tokens: { private: 'PRIVATE_TOKEN' },
  }));
  const calls = [],
    state = {
      focus: 'w1:p1',
      scope: 'herdr:test',
      status: { type: 'idle' },
      owner: true,
      atBottom: true,
      processName: 'codex',
      pidOffset: 0,
      view: 'Approval 1. Yes, proceed\n2. No',
      changeView: false,
      changeAnsi: false,
      daemonIdentity: 'daemon-1',
    };
  let reads = 0,
    ansiReads = 0;
  const connect = async () => ({
    endpoint: { scope: state.scope },
    close() {},
    request: async (method, params) => {
      calls.push({ method, params });
      const a = infos.find(
        (a) => a.pane_id === (params.target || params.pane_id),
      );
      if (method === 'session.snapshot')
        return {
          type: 'session_snapshot',
          snapshot: {
            protocol: 22,
            version: '0.9.5',
            focused_pane_id: state.focus,
            focused_workspace_id: 'w1',
            focused_tab_id: infos.find((a) => a.pane_id === state.focus)
              ?.tab_id,
            workspaces: [{ workspace_id: 'w1', number: 1 }],
            tabs: infos.map((a, i) => ({
              workspace_id: 'w1',
              tab_id: a.tab_id,
              number: i + 1,
            })),
            panes: infos.map((a) => ({ pane_id: a.pane_id })),
            layouts: infos.map((a) => ({
              tab_id: a.tab_id,
              panes: [{ pane_id: a.pane_id }],
            })),
            agents: structuredClone(
              [...infos]
                .reverse()
                .map((a) => ({ ...a, focused: a.pane_id === state.focus })),
            ),
          },
        };
      if (method === 'agent.get')
        return {
          type: 'agent_info',
          agent: structuredClone({ ...a, focused: a.pane_id === state.focus }),
        };
      if (method === 'pane.process_info')
        return {
          type: 'pane_process_info',
          process_info: {
            pane_id: a.pane_id,
            foreground_processes: [
              {
                pid: 101 + infos.indexOf(a) + state.pidOffset,
                name: state.processName,
                cwd: '/project',
              },
            ],
          },
        };
      if (method === 'pane.get')
        return {
          type: 'pane_info',
          pane: {
            ...a,
            focused: a.pane_id === state.focus,
            scroll: { offset_from_bottom: state.atBottom ? 0 : 4 },
          },
        };
      if (method === 'agent.focus') {
        state.focus = a.pane_id;
        return { type: 'ok' };
      }
      if (method === 'agent.read')
        return {
          type: 'pane_read',
          read: {
            pane_id: a.pane_id,
            workspace_id: a.workspace_id,
            tab_id: a.tab_id,
            source: 'visible',
            format: params.format,
            truncated: false,
            text:
              state.changeView && ++reads > 1
                ? 'Changed request'
                : state.changeAnsi &&
                    params.format === 'ansi' &&
                    ++ansiReads > 1
                  ? 'Different selection styling'
                  : state.view,
          },
        };
      if (method === 'pane.zoom')
        return {
          type: 'pane_zoom',
          zoom: { pane_id: a.pane_id, changed: true },
        };
      if (method === 'agent.send_keys') return { type: 'ok' };
      throw Error('Unexpected request');
    },
  });
  const b = new HerdrBridge(
    {
      ...structuredClone(defaults),
      backend: 'herdr',
      herdr: { titleIdentity: true },
      allowClipboardFocus: false,
    },
    {
      connect,
      owner: async () => state.owner,
      identity: {
        resolve: async (a, title) => {
          const prefix =
            require('../../com.local.rexagents.sdPlugin/herdr-title-identity').titlePrefix(
              title,
            );
          const full = prefix.length === 36 ? prefix : id;
          if (state.identityError) throw Error(state.identityError);
          return {
            chatId: full,
            nativeIdentity: state.daemonIdentity,
            status: structuredClone(state.status),
          };
        },
      },
    },
  );
  return {
    b,
    infos,
    state,
    calls,
    mutations: () =>
      calls.filter((c) =>
        ['agent.focus', 'pane.zoom', 'agent.send_keys'].includes(c.method),
      ),
  };
}
test('herdr bridge', async () => {
  const f = fixture(),
    agents = await f.b.discover();
  assert.deepEqual(
    agents.map((a) => a.block),
    ['w1:p1', 'w1:p2'],
  );
  assert(!JSON.stringify(agents).includes('PRIVATE_TOKEN'));
  assert.equal(agents[0].composerSupported, false);
  await f.b.focus(agents[1]);
  assert.equal(f.state.focus, 'w1:p2');
  assert.equal(f.b.lastTarget.terminalId, 'term-2');
  await f.b.zoom();
  assert.deepEqual(f.calls.at(-1), {
    method: 'pane.zoom',
    params: { pane_id: 'w1:p2', mode: 'toggle' },
  });
  assert.equal(
    await D.readFooter(f.b, agents[0]),
    id,
    'native session comes from the opt-in title binding',
  );
  const context = { target: C.snapshot(agents[0]), verifyChat: true };
  const n = f.mutations().length;
  await assert.rejects(() => f.b.withContext(context, () => f.b.togglePlan()));
  assert.equal(f.mutations().length, n);
  assert.equal(f.b.lastTarget, null);
  for (const alter of [
    (x) => (x.state.pidOffset = 10),
    (x) => (x.infos[0].terminal_id = 'replacement'),
    (x) => (x.state.scope = 'herdr:restarted'),
    (x) => (x.state.processName = 'bash'),
    (x) => (x.state.owner = false),
  ]) {
    const x = fixture(),
      a = (await x.b.discover())[0];
    alter(x);
    await assert.rejects(() => x.b.focus(a));
    assert.equal(x.mutations().length, 0);
  }
  const partial = fixture();
  await partial.b.discover();
  const slots = structuredClone(partial.b.slots);
  partial.b.owner = async () => {
    throw Error('Owner read failed');
  };
  await assert.rejects(() => partial.b.collapse());
  assert.deepEqual(
    partial.b.slots,
    slots,
    'partial foreground discovery must preserve known slots',
  );
  const absent = fixture();
  absent.b.config.herdr.titleIdentity = false;
  const aa = (await absent.b.discover())[0];
  await assert.rejects(
    () => absent.b.nativeChatId(aa),
    /title matching|thread-ID title/,
  );
  const approval = fixture();
  approval.state.status = {
    type: 'active',
    activeFlags: ['waitingOnApproval'],
  };
  let a = (await approval.b.discover())[0];
  assert.equal(a.kind, 'permission');
  await approval.b.withContext(
    { target: C.snapshot(a), verifyChat: true },
    () => approval.b.approvalKey('enter'),
  );
  assert.deepEqual(approval.calls.at(-1), {
    method: 'agent.send_keys',
    params: { target: 'w1:p1', keys: ['enter'] },
  });
  const changing = fixture();
  changing.state.status = {
    type: 'active',
    activeFlags: ['waitingOnApproval'],
  };
  changing.state.changeView = true;
  a = (await changing.b.discover())[0];
  await assert.rejects(
    () =>
      changing.b.withContext({ target: C.snapshot(a), verifyChat: true }, () =>
        changing.b.approvalKey('enter'),
      ),
    /(?:request|view) changed/,
  );
  assert.equal(changing.mutations().length, 0);
  const ansi = fixture();
  ansi.state.status = { type: 'active', activeFlags: ['waitingOnApproval'] };
  ansi.state.changeAnsi = true;
  a = (await ansi.b.discover())[0];
  await assert.rejects(
    () =>
      ansi.b.withContext({ target: C.snapshot(a), verifyChat: true }, () =>
        ansi.b.approvalKey('enter'),
      ),
    /view changed/,
  );
  assert.equal(ansi.mutations().length, 0);
  const marker = fixture();
  marker.state.status = { type: 'active', activeFlags: ['waitingOnUserInput'] };
  marker.state.view = 'Which color?\n› 1. Red\n  2. Blue';
  const captured = (await marker.b.discover())[0];
  marker.state.view = 'Which color?\n  1. Red\n› 2. Blue';
  assert.equal((await marker.b.discover())[0].statusAt, captured.statusAt);
  marker.state.view = 'Which size?\n› 1. Small\n  2. Large';
  await assert.rejects(
    () =>
      marker.b.withContext(
        { target: C.snapshot(captured), verifyChat: true },
        () => marker.b.questionKey('enter'),
      ),
    /request changed/,
  );
  assert.equal(marker.mutations().length, 0);
  marker.state.view = 'Which color?\n  1. Red\n   2. Blue';
  await assert.rejects(
    () =>
      marker.b.withContext(
        { target: C.snapshot(captured), verifyChat: true },
        () => marker.b.questionKey('enter'),
      ),
    /request changed/,
  );
  assert.equal(marker.mutations().length, 0);
  const question = fixture();
  question.state.status = {
    type: 'active',
    activeFlags: ['waitingOnUserInput'],
  };
  a = (await question.b.discover())[0];
  assert.equal(a.kind, 'question');
  await question.b.withContext(
    { target: C.snapshot(a), verifyChat: true },
    () => question.b.questionKey('down'),
  );
  assert.deepEqual(question.calls.at(-1).params, {
    target: 'w1:p1',
    keys: ['down'],
  });
  question.state.atBottom = false;
  const before = question.mutations().length;
  await assert.rejects(
    () =>
      question.b.withContext({ target: C.snapshot(a), verifyChat: true }, () =>
        question.b.questionKey('enter'),
      ),
    /bottom/,
  );
  assert.equal(question.mutations().length, before);
  const background = fixture();
  background.state.status = {
    type: 'idle',
    backgroundOnly: true,
    backgroundIds: ['term-process'],
    backgroundTurnId: 'turn-ended',
  };
  const bg = (await background.b.discover())[0];
  assert.equal(C.modeOf(bg), 'background');
  assert.equal(C.homeRow(bg).at(-1), 'stopTerminals');
  const chat = fixture();
  chat.state.status = { type: 'active', activeFlags: ['waitingOnUserInput'] };
  const oldChat = (await chat.b.discover())[0];
  chat.infos[0].terminal_title_stripped =
    '01a1ae31-f4ee-7212-b16a-f3b61ddf3688';
  await assert.rejects(
    () =>
      chat.b.withContext(
        { target: C.snapshot(oldChat), verifyChat: true },
        () => chat.b.questionKey('enter'),
      ),
    /Reselect/,
  );
  assert.equal(chat.mutations().length, 0);
  const labels = require('../../com.local.rexagents.sdPlugin/agent-labels'),
    labelAgent = {
      ...agents[0],
      model: 'current',
      effort: 'medium',
      metadataAt: 1,
    };
  const labelBridge = {
    agents: [labelAgent],
    lastTarget: labelAgent,
    lastModel: {
      ...labelAgent,
      terminalId: 'replaced-terminal',
      model: 'stale',
      at: 10,
    },
  };
  assert.deepEqual(labels.modelLines(labelBridge), ['Model', 'Current']);
  labelBridge.lastModel = {
    ...labelAgent,
    chatId: 'another-chat',
    model: 'stale',
    at: 10,
  };
  assert.deepEqual(labels.modelLines(labelBridge), ['Model', 'Current']);
  labelBridge.lastModel = {
    ...labelAgent,
    nativeIdentity: 'old-generation',
    model: 'stale',
    at: 10,
  };
  assert.deepEqual(
    labels.modelLines(labelBridge),
    ['Model', 'Current'],
    'old daemon/binding captions cannot override fresh native metadata',
  );
  const plan = fixture();
  await plan.b.togglePlan();
  assert.deepEqual(plan.calls.at(-1).params, {
    target: 'w1:p1',
    keys: ['shift+tab'],
  });
  for (const method of ['stage', 'send', 'submitRunning', 'adjustEffort']) {
    const x = fixture();
    await assert.rejects(() => x.b[method]('review'));
    assert.equal(x.mutations().length, 0);
  }
  const disabled = fixture();
  disabled.b.config.daemonControls.permissionsEnabled = false;
  await assert.rejects(
    () => disabled.b.cycleControl('permissions'),
    /daemon controls/,
  );
  assert.equal(disabled.mutations().length, 0);
  const restarted = fixture();
  const old = (await restarted.b.discover())[0];
  restarted.b.lastTarget = old;
  restarted.state.scope = 'herdr:replacement';
  await restarted.b.discover();
  assert.equal(restarted.b.lastTarget, null);
  assert(restarted.b.selectionNotice);
  const lost = fixture();
  const previous = (await lost.b.discover())[0];
  lost.b.lastTarget = previous;
  lost.state.identityError = 'Title chat is not loaded';
  await lost.b.discover();
  assert.equal(lost.b.lastTarget, null);
  assert.equal(lost.b.agents[0].chatId, undefined);
  assert.equal(C.modeOf(lost.b.agents[0]), 'unknown');
  await assert.rejects(
    () =>
      lost.b.withContext(
        { target: C.snapshot(previous), verifyChat: true },
        () => lost.b.cycleControl('model'),
      ),
    /not loaded/,
  );
  const daemon = fixture();
  const previousDaemon = (await daemon.b.discover())[0];
  daemon.state.daemonIdentity = 'daemon-2';
  await assert.rejects(
    () =>
      daemon.b.withContext(
        { target: C.snapshot(previousDaemon), verifyChat: true },
        () => daemon.b.togglePlan(),
      ),
    /Reselect/,
  );
  assert.equal(daemon.mutations().length, 0);
  const restore = fixture();
  const oldBinding = (await restore.b.discover())[0];
  restore.infos[0].terminal_title_stripped = 'Project';
  await restore.b.discover();
  restore.infos[0].terminal_title_stripped = id.slice(0, 29) + '...';
  const rebound = (await restore.b.discover())[0];
  assert.notEqual(rebound.nativeIdentity, oldBinding.nativeIdentity);
  await assert.rejects(
    () =>
      restore.b.withContext(
        { target: C.snapshot(oldBinding), verifyChat: true },
        () => restore.b.togglePlan(),
      ),
    /Reselect/,
  );
  assert.equal(restore.mutations().length, 0);
  const staleHook = fixture();
  staleHook.infos[0].agent_session.value =
    '01a1ae31-f4ee-7212-b16a-f3b61ddf3688';
  assert.equal(
    (await staleHook.b.discover())[0].chatId,
    id,
    'hook claims cannot override native title matching',
  );
  const run = fixture();
  run.state.status = { type: 'active', activeFlags: [], runId: 'run-one' };
  const oldRun = (await run.b.discover())[0];
  run.b.lastChecked = oldRun;
  run.state.status.runId = 'run-two';
  await assert.rejects(
    () =>
      run.b.translate([
        'send-key',
        '-s',
        oldRun.session,
        '-b',
        oldRun.block,
        'escape',
      ]),
    /new turn/,
  );
  assert.equal(run.mutations().length, 0);
  for (const alter of [
    (x) => (x.infos[0].terminal_title_stripped = 'Project'),
    (x) => (x.infos[0].terminal_id = 'new-terminal'),
    (x) => (x.state.pidOffset = 1),
  ]) {
    const during = fixture();
    during.b.identity.resolve = async () => {
      alter(during);
      return {
        chatId: id,
        nativeIdentity: 'daemon-1',
        status: { type: 'idle' },
      };
    };
    const stale = (await during.b.discover())[0];
    assert.equal(stale.nativeVerified, false);
    assert.equal(stale.chatId, undefined);
  }
  const home = C.homeRow({ ...agents[0], state: 'working' });
  assert.deepEqual(home, ['none', 'none', 'zoom', 'none', 'interrupt']);
  assert.equal(C.layout(2, agents[0])[0], 'inputInfo');
  console.log(
    'PASS Herdr topology/order, process ownership and foreground identity, terminal/server replacement guards, native session binding, focus/Zoom, native approval/question keys, changed-view/scroll guards, Plan and disabled unverified composer actions',
  );
});
