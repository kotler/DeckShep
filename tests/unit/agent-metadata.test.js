'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AgentMetadata } = require('../../src/agents/codex/metadata');
const {
  agentLines,
  modelLines,
  ellipsize,
} = require('../../src/domain/labels');
const { svg } = require('../../src/render/visuals');
const id = '01a1ae31-d050-7503-afec-fd2b40d2bc26';
function fixture() {
  let time = 1000,
    footer = id,
    closed = 0;
  const agent = {
    session: 's',
    block: 'b',
    pid: 42,
    app: 'codex',
    cwd: '/work/my-project',
    project: 'my-project',
    state: 'working',
  };
  const bridge = { config: { metadataRefreshMs: 4000 }, agents: [agent] },
    calls = [];
  const thread = {
    id,
    cwd: agent.cwd,
    name: 'Fix the login flow',
    model: 'gpt-6-luna',
    preview: 'PRIVATE FIRST PROMPT',
    status: { type: 'active' },
  };
  const rpc = {
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === 'thread/loaded/list') return { data: [id] };
      if (method === 'thread/read') return { thread };
      if (method === 'thread/turns/list')
        return {
          data: [
            {
              id: 'active-turn',
              status: 'inProgress',
              items: [],
              itemsView: 'notLoaded',
            },
          ],
        };
      throw Error('Unexpected method');
    },
    close: () => closed++,
  };
  const reader = new AgentMetadata(bridge, {
    now: () => time,
    socketFor: async () => ({ socket: '/local' }),
    footer: async () => footer,
    connect: async () => rpc,
  });
  return {
    agent,
    bridge,
    calls,
    thread,
    reader,
    rpc,
    setTime: (v) => (time = v),
    setFooter: (v) => (footer = v),
    closed: () => closed,
  };
}
test('agent metadata', async () => {
  const f = fixture();
  await f.reader.refresh([f.agent]);
  const lines = agentLines(f.agent);
  assert(lines[0].startsWith('Fix the'));
  assert(lines[0].endsWith('…'));
  assert.deepEqual(lines.slice(1), ['my-project', 'WORKING']);
  assert.equal(f.agent.chatName, 'Fix the login flow');
  assert.equal(f.agent.model, 'gpt-6-luna');
  assert.equal(f.closed(), 1);
  assert.deepEqual(f.calls, [
    { method: 'thread/loaded/list', params: { limit: 100 } },
    { method: 'thread/read', params: { threadId: id, includeTurns: false } },
    {
      method: 'thread/turns/list',
      params: {
        threadId: id,
        limit: 1,
        sortDirection: 'desc',
        itemsView: 'notLoaded',
      },
    },
  ]);
  assert(!JSON.stringify([...f.reader.cache]).includes('PRIVATE'));
  assert(!Object.hasOwn(f.agent, 'preview'));
  const copy = { ...f.agent, chatName: undefined };
  await f.reader.refresh([copy]);
  assert.equal(copy.chatName, f.agent.chatName);
  assert.equal(f.calls.length, 3);
  f.setTime(6000);
  f.thread.name = 'Renamed chat';
  await f.reader.refresh([copy]);
  assert.equal(copy.chatName, 'Renamed chat');
  f.thread.name = null;
  await f.reader.refresh([copy], true);
  assert.equal(copy.chatName, 'Untitled chat');
  f.thread.cwd = '/other';
  await f.reader.refresh([copy], true);
  assert.equal(copy.chatName, 'Untitled chat');
  assert.equal(f.closed(), 4);
  const changed = fixture();
  let n = 0;
  changed.reader.footer = async () => (++n === 1 ? id : 'different');
  await changed.reader.refresh([changed.agent]);
  assert.equal(changed.agent.chatName, 'Name unavailable');
  assert.equal(changed.closed(), 1);
  const unknown = fixture();
  unknown.rpc.request = async () => ({ data: [] });
  await unknown.reader.refresh([unknown.agent]);
  assert.equal(unknown.agent.chatName, 'Name unavailable');
  assert(!unknown.reader.cache.size);
  const herdr = fixture();
  herdr.bridge.backend = 'herdr';
  herdr.agent.chatName = 'Known Herdr title';
  herdr.rpc.request = async () => ({ data: [] });
  await herdr.reader.refresh([herdr.agent]);
  assert.equal(herdr.agent.chatName, 'Known Herdr title');
  assert.equal(herdr.agent.model, undefined);
  const authoritative = fixture();
  authoritative.agent.backend = 'herdr';
  authoritative.agent.herdrChatId = id;
  authoritative.agent.nativeIdentity = 'daemon-1';
  authoritative.agent.nativeVerified = true;
  authoritative.agent.runId = 'current-run';
  authoritative.bridge.backend = 'herdr';
  await authoritative.reader.refresh([authoritative.agent]);
  authoritative.agent.runId = 'new-run';
  authoritative.reader.hydrate([authoritative.agent]);
  assert.equal(
    authoritative.agent.runId,
    'new-run',
    'cached metadata must not replace fresh Herdr native activity',
  );
  const generation = {
    ...authoritative.agent,
    nativeIdentity: 'daemon-2',
    chatName: 'Fresh',
    model: null,
  };
  authoritative.reader.hydrate([generation]);
  assert.equal(
    generation.model,
    null,
    'a replacement daemon cannot inherit stale metadata',
  );
  const alias = fixture();
  alias.bridge.config.projectAliases = { [alias.agent.cwd]: 'Product' };
  await alias.reader.refresh([alias.agent]);
  assert.equal(alias.agent.project, 'Product');
  await alias.reader.refresh([]);
  assert.equal(alias.reader.cache.size, 0);
  assert.deepEqual(
    agentLines(
      { ...f.agent, chatName: 'Short', state: 'blocked', kind: 'permission' },
      { b: 'My chat' },
    ),
    ['My chat', 'my-project', 'CHOICE'],
  );
  assert.equal(ellipsize('Hello'), 'Hello');
  assert(ellipsize('A very long conversation title').endsWith('…'));
  const family = '👨‍👩‍👧‍👦';
  assert.equal(ellipsize(family.repeat(10), 55, 18), family.repeat(2) + '…');
  assert.equal(ellipsize('Hello\n\u202etitle'), 'Hellotitle');
  const bridge = {
    agents: [{ ...f.agent, metadataAt: 1000 }],
    lastTarget: { session: 's', block: 'b', pid: 42 },
  };
  assert.deepEqual(modelLines(bridge), ['Model', '6 Luna']);
  bridge.lastModel = { ...bridge.lastTarget, model: 'gpt-5.6-sol', at: 2000 };
  assert.equal(modelLines(bridge)[1], '5.6 Sol');
  bridge.agents[0].metadataAt = 3000;
  assert.equal(modelLines(bridge)[1], '6 Luna');
  bridge.lastTarget.pid = 43;
  assert.deepEqual(modelLines(bridge), ['Model', 'Agent closed']);
  assert.deepEqual(modelLines({}), ['Model', 'Select agent']);
  const image = svg({
    icon: 'codex',
    agent: true,
    lines: agentLines({ ...f.agent, chatName: 'A < B' }),
  });
  assert(image.includes('A &lt; B'));
  // Upstream SVG titles are accessibility metadata, not visible key captions.
  assert(!/<text\b[^>]*>\s*Codex\s*<\/text>/.test(image));
  assert(image.includes('y="48"'));
  assert(image.includes('y="124"'));
  console.log(
    'PASS chat/project/status labels, Unicode ellipsis, aliases, last-verified models, metadata-only busy-agent reads, identity guards, cache freshness and no preview retention',
  );
});
