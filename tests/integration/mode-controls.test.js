'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  { harness } = require('../helpers/plugin-harness');
const { reviewerLines } = require('../../src/domain/labels');
const { AgentMetadata } = require('../../src/agents/codex/metadata');
test('mode controls', async () => {
  // Explicit consent for this synthetic native-control scenario.
  const h = harness({ fixtureConsent: true });
  h.change('a', {
    collaborationMode: 'default',
    reviewer: 'auto_review',
    metadataAt: 1,
  });
  h.change('b', { collaborationMode: 'plan', metadataAt: 1 });
  await h.ready();
  assert.match(h.image(2, 2), />Approve<\/text><text[^>]*>for me</);
  assert.equal(h.action(1, 3), 'none');
  assert(h.image(2, 3).includes('>Default<'));
  assert(!h.image(2, 3).includes('<path'));
  assert(h.image(2, 1).includes('>Effort<'));
  assert.match(
    h.image(2, 1),
    /<text\b[^>]*>Effort<\/text><text\b[^>]*><\/text>/,
  );
  assert(
    h.image(2, 1).includes('<path'),
    'Effort uses the matching brain icon',
  );
  assert.equal(h.action(2, 2), 'permissions');
  await h.press(2, 3);
  assert.deepEqual(
    h.calls.map((c) => c.args.at(-1)),
    ['shift+tab'],
  );
  assert(
    h.image(2, 3).includes('>Updating…<'),
    'do not infer mode from a key press',
  );
  h.change('a', { collaborationMode: 'plan', metadataAt: Date.now() + 1 });
  await h.api.refresh();
  assert(h.image(2, 3).includes('>Plan<'));
  assert(!h.image(2, 3).includes('Toggle sent'));
  h.change('a', { collaborationMode: 'default', metadataAt: Date.now() + 2 });
  await h.api.refresh();
  assert(
    h.image(2, 3).includes('>Default<'),
    'manual mode changes update display',
  );
  await h.press(0, 1);
  assert(
    h.image(2, 3).includes('>Plan<'),
    'each selected agent has its own mode',
  );
  h.change('b', { collaborationMode: null });
  await h.api.refresh();
  assert(
    h.image(2, 3).includes('>Mode<'),
    'missing metadata must not fabricate Default',
  );
  const agent = {
      session: 's',
      block: 'b',
      pid: 42,
      app: 'codex',
      cwd: '/project',
      state: 'idle',
    },
    id = '01a1ae31-d050-7503-afec-fd2b40d2bc26';
  const calls = [],
    thread = {
      id,
      cwd: agent.cwd,
      name: 'Test',
      model: 'test-model',
      status: { type: 'idle' },
    },
    rpc = {
      close() {},
      request: async (method, params) => {
        calls.push({ method, params });
        if (method === 'thread/loaded/list') return { data: [id] };
        if (method === 'thread/read') return { thread };
        throw Error('Unexpected method');
      },
    };
  let settingsCalls = 0;
  const metadata = new AgentMetadata(
    { config: {} },
    {
      socketFor: async () => ({}),
      connect: async () => rpc,
      footer: async () => id,
      settings: async () => {
        settingsCalls++;
        return {
          cwd: '/project',
          reviewer: 'auto_review',
          collaborationMode: {
            mode: 'plan',
            settings: { developer_instructions: 'PRIVATE' },
          },
        };
      },
    },
  );
  await metadata.refresh([agent]);
  assert.equal(agent.collaborationMode, 'plan');
  assert.equal(agent.reviewer, 'auto_review');
  assert.equal(settingsCalls, 1);
  assert(!JSON.stringify([...metadata.cache]).includes('PRIVATE'));
  assert(
    calls.every((c) =>
      ['thread/loaded/list', 'thread/read'].includes(c.method),
    ),
  );
  metadata.settings = async () => {
    throw Error('Unavailable');
  };
  await metadata.refresh([agent], true);
  assert.equal(agent.collaborationMode, null);
  assert.equal(agent.reviewer, null);
  assert.equal(agent.chatName, 'Test', 'mode failure must not lose labels');
  metadata.settings = async () => ({
    cwd: '/other',
    collaborationMode: { mode: 'default' },
  });
  await metadata.refresh([agent], true);
  assert.equal(
    agent.collaborationMode,
    null,
    'do not use settings from a different cwd',
  );
  const bridge = {
    agents: [{ ...agent, chatId: id, reviewer: 'user', metadataAt: 100 }],
    lastTarget: agent,
  };
  assert.deepEqual(reviewerLines(bridge), ['Permissions', 'Ask me']);
  bridge.lastReviewer = {
    ...agent,
    chatId: id,
    reviewer: 'auto_review',
    at: 200,
  };
  assert.deepEqual(reviewerLines(bridge), ['Permissions', 'Approve for me']);
  bridge.agents[0].metadataAt = 300;
  assert.deepEqual(reviewerLines(bridge), ['Permissions', 'Ask me']);
  bridge.agents[0].metadataAt = 100;
  bridge.agents[0].chatId = 'other';
  assert.deepEqual(
    reviewerLines(bridge),
    ['Permissions', 'Ask me'],
    'a different chat must not inherit the last toggle',
  );
  bridge.agents[0].reviewer = null;
  assert.deepEqual(reviewerLines(bridge), ['Permissions']);
  bridge.lastTarget = { ...agent, pid: 43 };
  assert.deepEqual(
    reviewerLines(bridge),
    ['Permissions'],
    'a different process must not inherit reviewer state',
  );
  console.log(
    'PASS brain Effort icon and Permissions at the former Zoom key, text-only mode key, verified Plan/Default display, native toggle once, manual changes, agent isolation, unavailable metadata and settings privacy',
  );
});
