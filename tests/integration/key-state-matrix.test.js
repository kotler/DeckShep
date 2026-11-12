'use strict';
// The executable form of docs/validation/KEY-STATE-TEST-PLAN.md: for each
// provider, state and setup, what row 3 shows and maps to, and the inverse:
// which presses must send nothing. Synthetic agents only; no terminal is read.
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const { harness } = require('../helpers/plugin-harness');

const lines = (svg) =>
  [...svg.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]).filter(Boolean);
const withConfig = (over) => ({
  fs: {
    readFileSync: (file) =>
      JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...over }),
  },
});
const OFF = {}; // fresh install: no consent, Claude controls off
const ON = withConfig({ allowClipboardFocus: true, claude: { enabled: true } });
// Claude controls on, with the result of the passive pane read supplied by the
// table. The read itself is covered by tests/unit/claude-pane-picker.test.js;
// with visible-pane checks on, the controller would replace it with a real one.
const READ = withConfig({ claude: { enabled: true } });

const codex = { app: 'codex', name: 'codex' };
// A Claude pane with no hook binding: only what Rex and the pane read prove.
const claude = { app: 'claude-code', name: 'claude', chatId: undefined };
// A Claude pane bound by the optional hooks.
const hooked = {
  ...claude,
  chatId: 'chat-a',
  nativeVerified: true,
  claudeControlsEnabled: true,
};
const proof = { process: 'process-key' };

/** name, setup, agent patch, status word, row 3 actions, row 3 first lines. */
const MATRIX = [
  [
    'Codex ready',
    OFF,
    { ...codex, state: 'idle' },
    'Ready',
    ['model', 'effort', 'permissions', 'plan', 'interrupt'],
    ['Model', 'Effort', 'Permissions', 'Mode', 'Interrupt'],
  ],
  [
    'Codex done',
    OFF,
    { ...codex, state: 'done' },
    'Done',
    ['model', 'effort', 'permissions', 'plan', 'interrupt'],
    ['Model', 'Effort', 'Permissions', 'Mode', 'Interrupt'],
  ],
  [
    'Codex error',
    OFF,
    { ...codex, state: 'error' },
    'Error',
    ['model', 'effort', 'permissions', 'plan', 'interrupt'],
    ['Model', 'Effort', 'Permissions', 'Mode', 'Interrupt'],
  ],
  [
    'Codex working',
    OFF,
    { ...codex, state: 'working' },
    'Working',
    ['steer', 'queue', 'permissions', 'none', 'interrupt'],
    ['Steer', 'Queue', 'Permissions', null, 'Interrupt'],
  ],
  [
    'Codex background terminals',
    OFF,
    {
      ...codex,
      state: 'working',
      backgroundOnly: true,
      backgroundIds: ['p1'],
      backgroundTurnId: 'turn',
      activityStatusAt: 'v1',
    },
    // Row 1 reports Rex's own state; the background detail is on row 3.
    'Working',
    ['none', 'none', 'permissions', 'none', 'stopTerminals'],
    [null, null, 'Permissions', null, 'Stop'],
  ],
  [
    'Codex question',
    OFF,
    { ...codex, state: 'blocked', kind: 'question' },
    'Asking',
    ['up', 'down', 'answer', 'escape', 'interrupt'],
    ['Up', 'Down', 'Confirm', 'Esc', 'Interrupt'],
  ],
  [
    'Codex approval',
    OFF,
    { ...codex, state: 'blocked', kind: 'permission' },
    'Approve',
    [
      'approvalUp',
      'approvalDown',
      'approvalConfirm',
      'approvalEscape',
      'interrupt',
    ],
    ['Up', 'Down', 'Confirm', 'Esc', 'Interrupt'],
  ],
  [
    'Codex sign-in',
    OFF,
    { ...codex, state: 'blocked', kind: 'auth' },
    'Asking',
    ['status', 'none', 'none', 'none', 'none'],
    ['Open', null, null, null, null],
  ],
  [
    'Codex with no status record',
    OFF,
    { ...codex, state: 'unknown' },
    'Unknown',
    ['status', 'none', 'permissions', 'none', 'interrupt'],
    ['Check Rex', null, 'Permissions', null, 'Interrupt'],
  ],

  [
    'Claude ready, controls off',
    OFF,
    { ...claude, state: 'idle', rexSettings: {} },
    'Ready',
    ['status', 'none', 'none', 'none', 'none'],
    ['Check Rex', null, null, null, null],
  ],
  [
    'Claude ready, not yet verified',
    ON,
    { ...claude, state: 'idle', rexSettings: {} },
    'Ready',
    ['status', 'none', 'none', 'none', 'none'],
    ['Check Rex', null, null, null, null],
  ],
  [
    'Claude ready, pane verified',
    READ,
    {
      ...claude,
      state: 'idle',
      rexSettings: { ...proof, model: 'Opus', effort: 'high' },
    },
    'Ready',
    ['model', 'effort', 'permissions', 'none', 'interrupt'],
    ['Model', 'Effort', 'Permissions', null, 'Interrupt'],
  ],
  [
    'Claude just opened, empty prompt verified',
    READ,
    {
      ...claude,
      state: 'unknown',
      rexSettings: { ...proof, idleComposer: true },
    },
    'Unknown',
    ['model', 'effort', 'permissions', 'none', 'interrupt'],
    ['Model', 'Effort', 'Permissions', null, 'Interrupt'],
  ],
  [
    'Claude just opened, nothing verified',
    ON,
    { ...claude, state: 'unknown', rexSettings: {} },
    'Unknown',
    ['status', 'none', 'none', 'none', 'none'],
    ['Check Rex', null, null, null, null],
  ],
  [
    'Claude working, pane verified',
    READ,
    { ...claude, state: 'working', rexSettings: { ...proof } },
    'Working',
    ['none', 'none', 'none', 'none', 'interrupt'],
    [null, null, null, null, 'Interrupt'],
  ],
  [
    'Claude effort slider open',
    READ,
    {
      ...claude,
      state: 'idle',
      rexSettings: { ...proof, effortSlider: true, effort: 'high' },
    },
    'Ready',
    ['none', 'effort', 'none', 'none', 'none'],
    [null, 'Apply effort', null, null, null],
  ],

  [
    'Claude hooks ready',
    ON,
    { ...hooked, state: 'idle' },
    'Ready',
    ['model', 'effort', 'claudeInfo', 'none', 'interrupt'],
    ['Model', 'Effort', 'Claude', null, 'Interrupt'],
  ],
  [
    'Claude hooks working',
    ON,
    { ...hooked, state: 'working' },
    'Working',
    ['steer', 'queue', 'claudeInfo', 'none', 'interrupt'],
    ['Steer', 'Queue', 'Claude', null, 'Interrupt'],
  ],
  [
    'Claude hooks question',
    ON,
    { ...hooked, state: 'blocked', kind: 'question' },
    'Asking',
    ['up', 'down', 'answer', 'escape', 'interrupt'],
    ['Up', 'Down', 'Confirm', 'Esc', 'Interrupt'],
  ],
  [
    'Claude hooks multi-select question',
    ON,
    { ...hooked, state: 'blocked', kind: 'question', claudeMultiSelect: true },
    'Asking',
    ['up', 'down', 'answer', 'escape', 'claudeToggle'],
    ['Up', 'Down', 'Confirm', 'Esc', 'Toggle'],
  ],
  [
    'Claude hooks approval',
    ON,
    { ...hooked, state: 'blocked', kind: 'permission' },
    'Approve',
    [
      'approvalUp',
      'approvalDown',
      'approvalConfirm',
      'approvalEscape',
      'interrupt',
    ],
    ['Up', 'Down', 'Confirm', 'Esc', 'Interrupt'],
  ],
];

/** The reason shown on the status key, where the table expects one. */
const REASONS = {
  'Codex with no status record': 'No status yet',
  'Claude ready, controls off': 'Enable Claude',
  'Claude just opened, nothing verified': 'No status yet',
};

async function deck(setup, patch) {
  const h = harness(setup);
  h.change('a', patch);
  await h.ready();
  return h;
}
const columns = [0, 1, 2, 3, 4];

for (const [name, setup, patch, status, actions, captions] of MATRIX)
  test(`${name}: row 3 shows and maps what the plan says`, async () => {
    const h = await deck(setup, patch);
    assert.equal(lines(h.image(0, 0)).at(-1), status, 'agent key status word');
    assert.deepEqual(
      columns.map((c) => h.action(2, c)),
      actions,
    );
    columns.forEach((c) => {
      const shown = lines(h.image(2, c));
      if (captions[c] === null)
        assert.deepEqual(shown, [], `column ${c + 1} is blank`);
      else assert.equal(shown[0], captions[c], `column ${c + 1}`);
      // A fixed caption is never cut.
      assert(!shown.some((line) => line.includes('…')), shown.join(' / '));
    });
    if (REASONS[name])
      assert.equal(lines(h.image(2, 0)).slice(1).join(' '), REASONS[name]);
  });

for (const [name, setup, patch, , actions] of MATRIX)
  test(`${name}: blank and status keys send nothing`, async () => {
    const h = await deck(setup, patch);
    const sent = h.calls.length;
    for (const c of columns)
      if (['none', 'status', 'claudeInfo'].includes(actions[c]))
        await h.press(2, c);
    assert.equal(h.calls.length, sent);
  });

// A press drawn for one state must not act after the agent moved to another.
// Ready, done and error share one layout, so they move to working.
const moved = (patch) =>
  ['idle', 'done', 'error'].includes(patch.state)
    ? { state: 'working', kind: undefined, statusAt: 'v2' }
    : { state: 'idle', kind: undefined, statusAt: 'v2', backgroundOnly: false };
for (const [name, setup, patch, , actions] of MATRIX)
  test(`${name}: a press drawn before the state changed sends nothing`, async () => {
    const h = await deck(setup, patch);
    const drawn = columns.map((c) => h.api.keys.get(`2,${c}`).presented);
    h.change('a', moved(patch));
    await h.api.refresh();
    const sent = h.calls.length;
    for (const c of columns)
      if (!['none', 'status', 'claudeInfo'].includes(actions[c]))
        await h.press(2, c, drawn[c]);
    assert.equal(h.calls.length, sent);
  });
