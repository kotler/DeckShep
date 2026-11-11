const { test } = require('node:test'),
  assert = require('node:assert/strict');
const {
  foreground,
  validateInfo,
  HerdrBridge,
} = require('../../src/app/herdr-session');
const { dialog } = require('../../src/agents/claude/controls');
const picker = require('../../src/agents/claude/cycle');
const labels = require('../../src/domain/labels');
test('Herdr native metadata refuses every missing identity field and ambiguous/replaced process before input', async () => {
  const info = {
    pane_id: 'w1:p1',
    terminal_id: 'terminal',
    workspace_id: 'w1',
    tab_id: 'w1:t1',
    focused: true,
    revision: 1,
    agent: 'codex',
    agent_status: 'idle',
  };
  assert.equal(validateInfo(info), info);
  for (const [key, value] of [
    ['pane_id', 'bad'],
    ['terminal_id', ''],
    ['workspace_id', null],
    ['tab_id', null],
    ['focused', 1],
    ['revision', NaN],
    ['agent', 'bad agent'],
    ['agent', {}],
    ['agent_status', 'other'],
  ])
    assert.throws(() => validateInfo({ ...info, [key]: value }));
  assert.throws(() => validateInfo(null));
  assert.equal(validateInfo({ ...info, agent: null }).agent, null);
  const process = { pid: 42, name: '/bin/codex', cwd: '/fixture' },
    reply = { pane_id: info.pane_id, foreground_processes: [process] };
  assert.equal(foreground(info, reply).pid, 42);
  assert.equal(
    foreground(info, {
      ...reply,
      foreground_processes: [{ ...process, name: 'shell' }],
    }),
    null,
  );
  for (const bad of [
    {},
    { ...reply, pane_id: 'w1:p2' },
    { ...reply, foreground_processes: [process, process] },
    ...[0, -1, 1.5, NaN].map((pid) => ({
      ...reply,
      foreground_processes: [{ ...process, pid }],
    })),
    { ...reply, foreground_processes: [{ ...process, cwd: 'relative' }] },
  ])
    assert.throws(() => foreground(info, bad));
  assert.equal(
    foreground(
      { ...info, foreground_cwd: '/fallback' },
      { ...reply, foreground_processes: [{ ...process, cwd: '' }] },
    ).cwd,
    '/fallback',
  );
  for (const name of ['claude', 'claude-native', '2.1.319'])
    assert.equal(
      foreground(
        { ...info, agent: 'claude' },
        { ...reply, foreground_processes: [{ ...process, name }] },
      ).name,
      name,
    );
  assert.equal(
    foreground(
      { ...info, agent: 'other' },
      { ...reply, foreground_processes: [{ ...process, name: 'other' }] },
    ).pid,
    42,
  );
  const bridge = new HerdrBridge(
    require('../../com.kotl3r.deckshep.sdPlugin/config.json'),
    {
      connect: async () => {
        throw Error('No test transport');
      },
    },
  );
  const target = { chatId: 'chat', nativeIdentity: 'identity', runId: 'turn' };
  bridge.assertBinding(target, {
    ...target,
    nativeVerified: true,
    app: 'codex',
  });
  for (const live of [
    null,
    { app: 'codex' },
    { ...target, nativeVerified: true, chatId: 'other' },
    { ...target, nativeVerified: true, nativeIdentity: 'other' },
    { ...target, nativeVerified: true, runId: 'other' },
  ])
    assert.throws(() => bridge.assertBinding(target, live));
  for (const method of ['stage', 'send', 'submitRunning', 'adjustEffort'])
    await assert.rejects(bridge[method]());
});
test('Claude picker rejects changed menus, row numbering, selection, unknown models and ambiguous effort controls', async () => {
  const hint =
    'Enter to set as default · s to use this session only · Esc to cancel';
  const valid = [
    'Select model',
    '❯ 1. Opus 5.5',
    '  2. Sonnet 5.5',
    'extra high effort ← / →',
    hint,
  ].join('\n');
  assert.equal(picker.picker({ text: valid }).effort, 'xhigh');
  for (const value of [
    valid.replace('Select model', 'Other menu'),
    valid + '\ntrailing input',
    valid.replace('2. Sonnet', '3. Sonnet'),
    valid.replace('  2.', '❯ 2.'),
    valid.replace('Opus 5.5', 'Unknown 5.5'),
    valid.replace('extra high effort', 'unrecognized effort'),
    valid.replace(hint, 'high effort ← / →\n' + hint),
    [
      'Select model',
      ...Array.from(
        { length: 21 },
        (_, i) => `${i ? ' ' : '❯'} ${i + 1}. Opus 5.5`,
      ),
      hint,
    ].join('\n'),
  ])
    assert.throws(() => picker.picker({ text: value }));
  for (const [text, type] of [
    ['❯ 1. choice\nEsc to cancel', 'permission'],
    ['❯ 1. choice\n' + hint, 'picker'],
    ['1. choice\nEnter to select · Esc to cancel', 'question'],
    ['❯ Submit\nEnter to select · Esc to cancel', 'question'],
    [
      'Review your answers\nReady to submit your answers?\n❯ 1. Submit answers\n2. Cancel',
      'question',
    ],
  ])
    assert.throws(() => dialog(text, type));
  const base = {
    session: 'fixture',
    block: 'b',
    pid: 42,
    name: 'claude',
    app: 'claude-code',
    model: 'claude-opus-5-5',
  };
  for (const [kind, extra, confirmed] of [
    ['other', {}, true],
    ['model', { picker: {} }, true],
    ['model', {}, false],
    ['model', { agent: { vimMode: 'NORMAL' } }, true],
  ]) {
    let input = 0;
    const agent = { ...base, ...extra.agent },
      control = {
        b: {
          checked: async () => {
            input++;
          },
        },
        selected: async () => agent,
        bindings: new Map([
          ['fixture|b|claude-code|42|claude|', { confirmed }],
        ]),
        picker: extra.picker,
      };
    await assert.rejects(picker.cycle(control, kind, agent));
    assert.equal(input, 0);
  }
});
test('labels never present stale settings as confirmed and reject mismatched terminal or process identity', () => {
  const agent = {
    session: 's',
    block: 'b',
    pid: 42,
    app: 'claude-code',
    name: 'claude',
    state: 'idle',
    chatId: 'chat',
    metadataAt: 10,
  };
  assert.deepEqual(labels.modelLines({}), ['Model', 'Select agent']);
  assert.deepEqual(labels.modelLines({ lastTarget: agent }), [
    'Model',
    'Agent closed',
  ]);
  assert.deepEqual(labels.modeLines({}), ['Mode']);
  assert.deepEqual(labels.modeLines({ agents: [agent], lastTarget: agent }), [
    'Mode',
    'Use keyboard',
  ]);
  assert.deepEqual(labels.modelLines({ agents: [agent], lastTarget: agent }), [
    'Model',
    '',
  ]);
  assert.equal(
    labels.modelLines({
      agents: [{ ...agent, model: 'claude-opus' }],
      lastTarget: agent,
    })[1],
    'opus',
  );
  const bridge = {
    agents: [{ ...agent, effort: 'low', reviewer: 'user' }],
    lastTarget: agent,
    lastModel: { ...agent, chatId: 'other', at: 20, model: 'private-stale' },
    lastEffort: { ...agent, chatId: 'other', at: 20, effort: 'max' },
    lastReviewer: {
      ...agent,
      chatId: 'other',
      at: 20,
      reviewer: 'auto_review',
    },
  };
  assert.deepEqual(labels.modelLines(bridge), ['Model', '']);
  assert.deepEqual(labels.effortLines(bridge), ['Effort', 'Low']);
  assert.deepEqual(labels.reviewerLines(bridge), ['Permissions', 'Ask me']);
  for (const patch of [
    { session: 'other' },
    { block: 'other' },
    { pid: 43 },
    { app: 'codex' },
    { name: 'other' },
    { terminalId: 'other' },
    { nativeIdentity: 'other' },
  ])
    assert(!labels.sameTarget(agent, { ...agent, ...patch }));
  assert(
    labels.sameTarget(agent, { ...agent, app: undefined, name: undefined }),
  );
  assert(!labels.sameTarget(null, agent));
  assert.equal(
    labels.agentLines({ ...agent, chatName: undefined, project: undefined })[2],
    'READY',
  );
  assert.equal(
    labels.agentLines({ ...agent, state: 'unsupported' })[2],
    'UNKNOWN',
  );
});
