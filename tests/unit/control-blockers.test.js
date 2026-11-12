'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  BLOCKER_TEXT,
  controlBlocker,
  blockerHelp,
} = require('../../src/domain/blockers');
const { observeSettings } = require('../../src/app/rex-keyboard-settings');
const { keyFace } = require('../../src/app/key-face');

const on = { visibleChecks: true, claudeEnabled: true };
const claude = (over = {}) => ({
  app: 'claude-code',
  state: 'idle',
  session: 's',
  block: 'a',
  pid: 7,
  ...over,
});

test('every blocker has a key caption of at most 15 and help of at most 160 characters', () => {
  for (const [code, text] of Object.entries(BLOCKER_TEXT)) {
    assert(text.caption.length <= 15, code);
    for (const backend of ['Rex', 'Herdr']) {
      const help = blockerHelp(code, backend);
      assert(help.length <= 160, code);
      assert(!help.includes('{'), code);
    }
  }
});

test('the most actionable reason wins, and none is invented', () => {
  const cases = [
    [null, on, null],
    [claude(), { ...on, claudeEnabled: false }, 'claude-off'],
    [claude(), { ...on, visibleChecks: false }, 'checks-off'],
    // Consent comes before any reading problem.
    [
      claude({ rexSettings: { why: 'custom-keys' } }),
      { ...on, visibleChecks: false },
      'checks-off',
    ],
    [claude({ rexSettings: { why: 'custom-keys' } }), on, 'custom-keys'],
    [claude({ rexSettings: { why: 'cli-unverified' } }), on, 'cli-unverified'],
    [
      claude({ state: 'unknown', rexSettings: { why: 'not-at-prompt' } }),
      on,
      'not-at-prompt',
    ],
    [claude({ state: 'unknown', rexSettings: {} }), on, 'no-status'],
    [
      claude({ state: 'unknown', claudeError: 'Wait for Claude view' }),
      on,
      null,
    ],
    [claude({ rexSettings: { process: 'p' } }), on, null],
    // Hook-bound controls do not depend on the passive pane read.
    [
      claude({
        nativeVerified: true,
        claudeControlsEnabled: true,
        rexSettings: { why: 'view-unreadable' },
      }),
      { ...on, visibleChecks: false },
      null,
    ],
    [{ app: 'codex', state: 'unknown' }, on, 'no-status'],
    [
      { app: 'codex', state: 'idle', rexSettings: { why: 'codex-unverified' } },
      on,
      'codex-unverified',
    ],
    [{ app: 'codex', state: 'idle' }, on, null],
    [claude({ backend: 'herdr', state: 'unknown' }), on, null],
    [{ app: 'shell', state: 'unknown' }, on, null],
  ];
  for (const [agent, options, expected] of cases)
    assert.equal(controlBlocker(agent, options), expected);
});

test('a passive read records the step that stopped it and grants nothing', async () => {
  const view = { text: '', hash: 'h', cursor: null };
  const bridge = (over = {}) => ({
    config: { claude: { enabled: true }, controlVerified: { codex: true } },
    inspectClaudeKeyboard: async () => 'process-key',
    inspectKeyboardProcess: async () => ({}),
    readKeyboardView: async () => view,
    ...over,
  });
  const read = (b, agent = claude()) => observeSettings(b, agent);
  let state = await read(
    bridge({
      inspectClaudeKeyboard: async () => {
        throw Error('Custom Claude keys');
      },
    }),
    claude({ state: 'working' }),
  );
  assert.equal(state.why, 'custom-keys');
  assert.equal(state.process, undefined);
  state = await read(
    bridge({
      inspectClaudeKeyboard: async () => {
        throw Error('Check Claude CLI');
      },
    }),
    claude({ state: 'working' }),
  );
  assert.equal(state.why, 'cli-unverified');
  state = await read(
    bridge({
      readKeyboardView: async () => {
        throw Error('Rex view changed');
      },
    }),
  );
  assert.equal(state.why, 'view-unreadable');
  assert.equal(state.viewHash, undefined);
  // An unknown state needs a recognised empty prompt before the idle keys.
  state = await read(bridge(), claude({ state: 'unknown' }));
  assert.equal(state.why, 'not-at-prompt');
  assert.equal(state.idleComposer, undefined);
  state = await read(
    bridge({ config: { claude: { enabled: true }, controlVerified: {} } }),
    { app: 'codex', state: 'idle', pid: 7 },
  );
  assert.deepEqual(state, { why: 'codex-unverified' });
  // Claude controls switched off: nothing is read and nothing is claimed.
  let reads = 0;
  state = await read(
    bridge({
      config: { claude: { enabled: false } },
      inspectClaudeKeyboard: async () => reads++,
      readKeyboardView: async () => reads++,
    }),
  );
  assert.deepEqual(state, {});
  assert.equal(reads, 0);
});

test('the status key names the blocker under the backend', () => {
  const palette = { unknown: '#555', idle: '#444', error: '#b03' };
  const face = (target, config = {}) =>
    keyFace({
      action: 'status',
      scope: 'rex',
      backendName: 'Rex',
      offline: false,
      now: 1000,
      contextStamp: 'stamp',
      mode: 'unknown',
      target,
      bridge: { slots: [], agents: [], draft: null },
      bank: 0,
      gaps: 0,
      config: {
        aliases: {},
        palette,
        animation: { enabled: false },
        claude: { enabled: true },
        allowClipboardFocus: true,
        controlVerified: { codex: true },
        ...config,
      },
      feedback: null,
      notice: null,
      pulse: () => 0,
    }).lines;
  assert.deepEqual(face(claude({ state: 'unknown', rexSettings: {} })), [
    'Check Rex',
    'No status yet',
  ]);
  assert.deepEqual(face(claude({ rexSettings: { why: 'custom-keys' } })), [
    'Check Rex',
    'Custom keys',
  ]);
  assert.deepEqual(face(claude(), { allowClipboardFocus: false }), [
    'Check Rex',
    'Enable checks',
  ]);
  assert.deepEqual(face(claude(), { claude: { enabled: false } }), [
    'Check Rex',
    'Enable Claude',
  ]);
});
