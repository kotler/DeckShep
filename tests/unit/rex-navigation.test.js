'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  navigationSnapshot,
  sameNavigationTarget,
} = require('../../src/domain/navigation');
const { isRexRead } = require('../../src/domain/transport');
const {
  refreshRexClaudeMetadata,
} = require('../../src/app/rex-provider-metadata');

const raw = {
  session: 's',
  window: 'w',
  block: 'b',
  pid: 42,
  app: 'claude-code',
  name: 'claude',
  state: 'idle',
  cwd: '/fixture',
  project: 'fixture',
  terminalTitle: 'Rex title',
};

test('navigation snapshots exclude provider proof, captions and background-task claims', () => {
  const snapshot = navigationSnapshot({
    ...raw,
    chatName: 'Provider title',
    chatId: 'thread',
    nativeIdentity: 'proof',
    codexHookEpoch: 'hook',
    backgroundOnly: true,
    model: 'model',
    effort: 'high',
  });
  assert.equal(snapshot.chatName, 'Rex title');
  for (const key of [
    'chatId',
    'nativeIdentity',
    'codexHookEpoch',
    'backgroundOnly',
    'model',
    'effort',
  ])
    assert.equal(Object.hasOwn(snapshot, key), false);
  assert(sameNavigationTarget(snapshot, { ...raw, nativeIdentity: 'changed' }));
  assert(!sameNavigationTarget(snapshot, { ...raw, pid: 43 }));
  assert(!sameNavigationTarget(snapshot, { ...raw, block: 'other' }));
  assert(!sameNavigationTarget(null, raw));
  assert.equal(
    navigationSnapshot({ ...raw, terminalTitle: '', sessionLabel: 'Workspace' })
      .chatName,
    'Workspace',
  );
  assert.equal(
    navigationSnapshot({ ...raw, terminalTitle: '' }).chatName,
    'Claude Code',
  );
  assert.equal(
    navigationSnapshot({ ...raw, app: 'codex', terminalTitle: '' }).chatName,
    'Codex',
  );
});

test('the title read allowlist grants no title write, arbitrary arguments or inferred target', () => {
  const args = ['block', 'call', '-s', 's', '-b', 'b', 'title'];
  assert(isRexRead(args));
  assert(!isRexRead([...args, '{"title":"changed"}']));
  assert(!isRexRead(['block', 'call', 'title']));
  assert(!isRexRead([...args.slice(0, 6), 'write']));
});

test('asynchronous Claude proof populates row-three identity without changing Rex navigation', async () => {
  const navigationAgents = [
    navigationSnapshot(raw),
    { ...raw, block: 'c', app: 'codex' },
  ];
  let reads = 0;
  const source = {
    navigationAgents,
    agents: navigationAgents.map((agent) => ({ ...agent })),
    lastTarget: { ...raw },
    claude: {
      prune(agents) {
        assert.equal(agents, navigationAgents);
      },
      async enrich(agent) {
        reads++;
        return {
          ...agent,
          nativeVerified: true,
          nativeIdentity: 'proof',
          chatId: 'thread',
          claudeControlsEnabled: true,
          chatName: 'Provider title',
          state: 'working',
        };
      },
    },
  };
  await refreshRexClaudeMetadata(source, () => true);
  assert.equal(reads, 1);
  assert.equal(source.agents[0].nativeIdentity, 'proof');
  assert.equal(source.lastTarget.chatId, 'thread');
  assert.equal(navigationAgents[0].chatName, 'Rex title');
  assert.equal(navigationAgents[0].state, 'idle');
  assert.equal(navigationAgents[0].nativeIdentity, undefined);
  source.claude.enrich = async (agent) => {
    source.lastTarget = null;
    return {
      ...agent,
      nativeVerified: true,
      nativeIdentity: 'replacement',
      chatId: 'other',
    };
  };
  await refreshRexClaudeMetadata(source, () => true);
  assert.equal(
    source.lastTarget,
    null,
    'root revocation still requires fresh selection',
  );
});

test('delayed Claude proof is discarded after a discovery or backend change', async () => {
  for (const change of ['discovery', 'backend']) {
    const navigationAgents = [{ ...raw }];
    const source = {
      navigationAgents,
      agents: [{ ...raw }],
      lastTarget: { ...raw },
      claude: {
        prune() {},
        async enrich(agent) {
          if (change === 'discovery')
            source.navigationAgents = [{ ...raw, pid: 43 }];
          return {
            ...agent,
            nativeVerified: true,
            nativeIdentity: 'stale',
            chatId: 'stale',
          };
        },
      },
    };
    await refreshRexClaudeMetadata(source, () => change !== 'backend');
    assert.equal(source.agents[0].nativeIdentity, undefined);
    assert.equal(source.lastTarget.nativeIdentity, undefined);
  }
  await refreshRexClaudeMetadata({}, () =>
    assert.fail('no Rex snapshot; no provider refresh'),
  );
});
