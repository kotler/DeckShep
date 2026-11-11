'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { keyFace, bankLines } = require('../../src/app/key-face');
const palette = {
  ready: '#2d7a3e',
  working: '#2563a8',
  blocked: '#a8741a',
  approval: '#a8741a',
  done: '#2d7a3e',
  error: '#b03a48',
  idle: '#444b5c',
  unknown: '#555555',
};
const config = {
  aliases: {},
  palette,
  animation: {
    enabled: true,
    frameMs: 250,
    workingPeriodMs: 2200,
    completePulseMs: 15000,
  },
  appearance: { style: 'signal' },
  claude: { enabled: false },
};
const agent = (over = {}) => ({
  session: 's',
  block: 'a',
  pid: 1,
  app: 'codex',
  name: 'codex',
  state: 'idle',
  project: 'proj',
  chatName: 'Chat',
  ...over,
});
const bridge = (over = {}) => ({
  slots: [{ session: 's', block: 'a' }],
  agents: [{ session: 's', block: 'a' }],
  draft: null,
  ...over,
});
const base = (over = {}) => ({
  action: 'none',
  scope: 'rex',
  backendName: 'Rex',
  offline: false,
  now: 1000,
  contextStamp: 'stamp',
  mode: 'ready',
  target: undefined,
  bridge: bridge(),
  bank: 0,
  gaps: 0,
  config,
  feedback: null,
  notice: null,
  pulse: () => 0,
  ...over,
});
const slotFace = (a, over = {}) =>
  base({
    action: 'agent:0',
    agentView: {
      slotPresent: true,
      agent: a,
      shown: a,
      elapsedMs: 500,
      selected: false,
    },
    ...over,
  });

test('agent slot: colour, icon and pulse follow the displayed state', () => {
  const rows = [
    ['idle', palette.ready],
    ['working', palette.working],
    ['done', palette.done],
    ['error', palette.error],
    ['unknown', palette.unknown],
  ];
  for (const [state, color] of rows) {
    const spec = keyFace(slotFace(agent({ state }), { pulse: () => 0.1 }));
    assert.equal(spec.agent, true, state);
    assert.equal(spec.icon, 'codex');
    assert.equal(spec.color, color, state);
    assert.equal(spec.pulse, 0.1);
    assert.equal(spec.badge, '');
    assert.equal(spec.style, 'signal');
  }
  const blocked = keyFace(
    slotFace(agent({ state: 'blocked', kind: 'question' })),
  );
  assert.equal(blocked.color, palette.blocked);
});

test('agent slot: selected badge, background colour and pulse arguments', () => {
  const seen = [];
  const spec = keyFace(
    slotFace(
      agent({
        state: 'working',
        backgroundOnly: true,
        backgroundIds: ['t'],
        backgroundTurnId: 'turn',
        statusAt: 'v1',
        activityStatusAt: 'v1',
      }),
      {
        agentView: {
          slotPresent: true,
          agent: agent({ state: 'working' }),
          shown: agent({
            state: 'working',
            backgroundOnly: true,
            backgroundIds: ['t'],
            backgroundTurnId: 'turn',
            statusAt: 'v1',
            activityStatusAt: 'v1',
          }),
          elapsedMs: 750,
          selected: true,
        },
        pulse: (state, elapsed) => (seen.push([state, elapsed]), 0.05),
      },
    ),
  );
  assert.equal(spec.badge, 'selected');
  assert.equal(spec.color, '#126b78');
  assert.deepEqual(seen, [['idle', 750]]);
});

test('empty, closed and offline slots', () => {
  const view = (slotPresent) => ({
    slotPresent,
    elapsedMs: 0,
    selected: false,
  });
  const closed = keyFace(base({ action: 'agent:1', agentView: view(true) }));
  assert.deepEqual(closed.lines, ['Closed']);
  assert.equal(closed.icon, 'empty');
  assert.equal(closed.color, palette.idle);
  const none = keyFace(base({ action: 'agent:2', agentView: view(false) }));
  assert.deepEqual(none.lines, ['No agent']);
  const offline = keyFace(
    base({ action: 'agent:1', offline: true, agentView: view(true) }),
  );
  assert.deepEqual(offline.lines, ['Rex offline']);
  assert.equal(offline.color, palette.error);
  assert.equal(offline.agent, true);
});

test('row 3 modes colour their controls', () => {
  const rows = [
    ['interrupt', 'working', '#813c42', ['Interrupt', 'running']],
    ['interrupt', 'ready', '#38414b', ['Interrupt', 'not running']],
    ['up', 'question', '#233a50', ['Up']],
    ['up', 'ready', '#38414b', ['Up']],
    ['answer', 'question', '#233a50', ['Confirm', 'Enter']],
    ['approvalUp', 'approval', '#78551e', ['Up', 'choice']],
    ['approvalConfirm', 'approval', '#78551e', ['Confirm', 'highlighted']],
    ['stopTerminals', 'background', '#813c42', ['Stop', '0 terminals']],
    ['none', 'ready', '#38414b', []],
    ['next', 'ready', '#233a50', ['Next agent']],
    ['mystery', 'ready', '#233a50', ['MYSTERY']],
  ];
  for (const [action, mode, color, lines] of rows) {
    const spec = keyFace(base({ action, mode }));
    assert.equal(spec.color, color, action + '/' + mode);
    assert.deepEqual(spec.lines, lines, action + '/' + mode);
    assert.equal(spec.agent, false);
  }
  assert.equal(keyFace(base({ action: 'none' })).icon, 'blank');
  assert.equal(keyFace(base({ action: 'effortIncrease' })).textOnly, true);
  assert.equal(
    keyFace(base({ action: 'steer', target: agent({ runId: 'r' }) })).color,
    '#233a50',
  );
  const loading = keyFace(base({ action: 'steer', target: agent() }));
  assert.deepEqual(loading.lines, ['Steer', 'loading run']);
  assert.equal(loading.color, '#38414b');
});

test('Rex settings captions replace the heading in ready mode', () => {
  const target = agent({ rexSettings: { model: 'gpt-6', effort: 'high' } });
  const spec = keyFace(base({ action: 'effort', mode: 'ready', target }));
  assert.deepEqual(spec.lines, ['Effort', 'high']);
});

test('feedback and notice overlays need the matching stamp and time', () => {
  const feedback = {
    action: 'model',
    stamp: 'stamp',
    until: 2000,
    message: 'Press again',
  };
  const shown = keyFace(base({ action: 'model', feedback }));
  assert.deepEqual(shown.lines, ['Unavailable', 'Press again']);
  assert.equal(shown.color, '#893748');
  assert.equal(shown.accent, '#d34263');
  for (const stale of [
    { ...feedback, stamp: 'old' },
    { ...feedback, until: 1000 },
    { ...feedback, action: 'effort' },
  ])
    assert.notDeepEqual(
      keyFace(base({ action: 'model', feedback: stale })).lines[0],
      'Unavailable',
    );
  const notice = { action: 'model', stamp: 'stamp', until: 2000, label: 'Set' };
  const done = keyFace(base({ action: 'model', notice }));
  assert.deepEqual(done.lines, ['Model', 'Set']);
  assert.equal(done.color, '#2b654c');
  assert.equal(
    keyFace(
      base({ action: 'collapse', notice: { ...notice, action: 'collapse' } }),
    ).lines[0],
    'Collapse',
  );
  assert.notEqual(
    keyFace(base({ action: 'plan', notice: { ...notice, action: 'plan' } }))
      .color,
    '#2b654c',
    'plan never shows a notice',
  );
});

test('keyFace does not mutate its input and is deterministic', () => {
  const input = slotFace(agent({ state: 'working' }));
  const frozen = JSON.stringify(input);
  const a = keyFace(input),
    b = keyFace(input);
  assert.equal(JSON.stringify(input), frozen);
  assert.deepEqual(a, b);
});

test('page captions', () => {
  const slots = Array.from({ length: 7 }, (_, i) => ({
    session: 's',
    block: String(i),
  }));
  assert.deepEqual(
    bankLines(bridge({ slots, agents: slots }), 0, false, 'Rex'),
    ['Page', '1/2', '2 off-page'],
  );
  assert.deepEqual(
    bankLines(bridge({ slots: [], agents: [] }), 0, false, 'Rex'),
    ['Page', 'No agents'],
  );
  assert.deepEqual(bankLines(bridge(), 0, true, 'Rex'), [
    'Page',
    'Rex offline',
  ]);
});

test('agent slots report their shape-coded state', () => {
  const view = (slotPresent) => ({
    slotPresent,
    elapsedMs: 0,
    selected: false,
  });
  const state = (a, over) => keyFace(slotFace(a, over)).state;
  assert.equal(state(agent({ state: 'idle' })), 'ready');
  assert.equal(state(agent({ state: 'working' })), 'working');
  assert.equal(state(agent({ state: 'done' })), 'done');
  assert.equal(state(agent({ state: 'error' })), 'error');
  assert.equal(state(agent({ state: 'unknown' })), 'unknown');
  assert.equal(
    state(agent({ state: 'blocked', kind: 'question' })),
    'question',
  );
  assert.equal(
    state(agent({ state: 'blocked', kind: 'permission' })),
    'approval',
  );
  assert.equal(
    state(
      agent({
        app: 'codex',
        state: 'working',
        backgroundOnly: true,
        statusAt: 's1',
        activityStatusAt: 's1',
        backgroundIds: ['t'],
        backgroundTurnId: 'turn',
      }),
    ),
    'background',
  );
  const closed = keyFace(base({ action: 'agent:1', agentView: view(true) }));
  assert.equal(closed.state, 'closed');
  assert.equal(
    keyFace(base({ action: 'agent:2', agentView: view(false) })).state,
    'empty',
  );
  assert.equal(
    keyFace(base({ action: 'agent:1', offline: true, agentView: view(true) }))
      .state,
    'offline',
  );
  assert.equal(keyFace(base({ action: 'next' })).state, undefined);
});

test('dim marks unavailable controls but never blank keys', () => {
  assert.equal(keyFace(base({ action: 'none' })).dim, undefined);
  assert.equal(keyFace(base({ action: 'interrupt', mode: 'ready' })).dim, true);
  assert.equal(keyFace(base({ action: 'collapse', offline: true })).dim, true);
  assert.equal(keyFace(base({ action: 'next' })).dim, undefined);
  assert.equal(
    keyFace(base({ action: 'interrupt', mode: 'working' })).dim,
    undefined,
  );
});

test('hold is set only when the key has a long-press action', () => {
  assert.equal(keyFace(base({ action: 'next', hold: true })).hold, true);
  assert.equal(keyFace(base({ action: 'next' })).hold, undefined);
});

test('attention face: kind heading, agent count and state accent', () => {
  const face = (kind, count) =>
    keyFace(base({ action: 'attention', attention: { kind, count } }));
  const waiting = face('waiting', 2);
  assert.deepEqual(waiting.lines, ['Waiting', '2 agents']);
  assert.equal(waiting.icon, 'attention');
  assert.equal(waiting.accent, '#d19c30');
  assert.equal(waiting.color, palette.blocked);
  const error = face('error', 1);
  assert.deepEqual(error.lines, ['Error', '1 agent']);
  assert.equal(error.accent, '#d34263');
  const done = face('done', 3);
  assert.deepEqual(done.lines, ['Done', '3 agents']);
  assert.equal(done.accent, '#28ad82');
  assert.equal(waiting.dim, undefined);
});
