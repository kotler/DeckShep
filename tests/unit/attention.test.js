'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { attentionCandidates } = require('../../src/domain/navigation');
const {
  holdActionOf,
  needsContext,
  localActions,
  layout,
} = require('../../src/domain/layout');
const {
  controlIdForAction,
  controlSpec,
  knownControls,
} = require('../../src/domain/capabilities');

const entry = (name, state, selected = false) => ({
  agent: { name },
  state,
  selected,
});

test('attention ranks blocked over error over done and keeps slot order', () => {
  const ranked = attentionCandidates([
    entry('done-0', 'done'),
    entry('error-1', 'error'),
    entry('blocked-2', 'blocked'),
    entry('blocked-3', 'blocked'),
    entry('error-4', 'error'),
  ]);
  assert.deepEqual(
    ranked.map((c) => [c.agent.name, c.kind, c.slot]),
    [
      ['blocked-2', 'waiting', 2],
      ['blocked-3', 'waiting', 3],
      ['error-1', 'error', 1],
      ['error-4', 'error', 4],
      ['done-0', 'done', 0],
    ],
  );
});

test('attention skips the selected agent, quiet states and empty slots', () => {
  assert.deepEqual(
    attentionCandidates([
      entry('mine', 'blocked', true),
      entry('idle', 'idle'),
      entry('working', 'working'),
      entry('unknown', 'unknown'),
      undefined,
    ]),
    [],
  );
  assert.deepEqual(
    attentionCandidates([
      entry('mine', 'done', true),
      entry('other', 'done'),
    ]).map((c) => c.agent.name),
    ['other'],
  );
  assert.deepEqual(attentionCandidates([]), []);
});

test('holdActionOf offers a hold only for Next and Page', () => {
  assert.equal(holdActionOf('next'), 'previous');
  assert.equal(holdActionOf('banknext'), 'bankprev');
  for (const action of [
    'none',
    'attention',
    'previous',
    'bankprev',
    'collapse',
    'agent:0',
    'interrupt',
    'model',
  ])
    assert.equal(holdActionOf(action), null, action);
});

test('attention and the hold twins are local navigation like agent and next', () => {
  for (const action of ['attention', 'previous', 'bankprev'])
    assert.equal(needsContext(action), false, action);
  assert(localActions.has('attention'));
  assert.equal(controlIdForAction('attention'), 'focus');
  assert.equal(controlIdForAction('previous'), 'focus');
  assert(knownControls.includes('attention'));
  assert.deepEqual(controlSpec('attention').requires, [
    'focus',
    'verifiedFocus',
  ]);
});

test('the attention slot is row 2, column 4 of the layout', () => {
  const actions = layout(0, undefined);
  assert.equal(actions[4], 'attention');
  assert.equal(actions[0], 'next');
  assert.equal(actions[1], 'banknext');
});
