'use strict';
const assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events');
const {
  BackgroundControls,
  terminalIds,
} = require('../../../com.local.rexagents.sdPlugin/background-controls');
const {
    AgentMetadata,
  } = require('../../../com.local.rexagents.sdPlugin/agent-metadata'),
  {
    DaemonRpc,
  } = require('../../../com.local.rexagents.sdPlugin/daemon-controls'),
  C = require('../../../com.local.rexagents.sdPlugin/context-controls'),
  {
    agentLines,
  } = require('../../../com.local.rexagents.sdPlugin/agent-labels'),
  { harness } = require('../../helpers/plugin-harness');
const id = '01a1af76-6618-7492-9377-d709a7fe8594';
function fixture() {
  let ids = ['p1', 'p2'],
    turn = { id: 'turn', status: 'interrupted' },
    footer = id,
    endpoint = { pid: 50, socket: '/socket' },
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
      throw Error('Unexpected method');
    },
  };
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
    reader: () => new AgentMetadata(b, { ...deps, now: () => time }),
    tick: () => time++,
  };
}

module.exports = { fixture };
