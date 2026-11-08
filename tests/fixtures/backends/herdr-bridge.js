'use strict';
const assert = require('node:assert/strict'),
  { HerdrBridge } = require('../../../src/app/herdr-session'),
  D = require('../../../src/agents/codex/daemon'),
  C = require('../../../src/guards/context');
const defaults = require('../../../com.local.rexagents.sdPlugin/config.json'),
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
            require('../../../src/agents/codex/title-identity').titlePrefix(
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

module.exports = { fixture };
