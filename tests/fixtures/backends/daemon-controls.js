'use strict';
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
} = require('../../../src/agents/codex/daemon');
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

module.exports = { fixture };
