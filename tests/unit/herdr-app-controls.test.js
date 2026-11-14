const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectAppControls } = require('../../src/domain/app-controls');

const target = { space: 's1', tab: 'c1', pane: 'p1', terminal: 't1' };
const codex = {
  target,
  name: 'Fix tests',
  reportedApp: 'codex',
  reportedStatus: 'idle',
};
function snapshot(panes = [codex], selected = target) {
  return {
    provenance: 'app-model',
    endpointGeneration: 1,
    verifiedFocus: false,
    panes,
    selected,
  };
}
test('passive controls resolve all four App address fields and reject ambiguous selection', () => {
  for (const field of Object.keys(target)) {
    const update = projectAppControls(
      null,
      snapshot([codex], { ...target, [field]: 'other' }),
      'reader-1',
    );
    assert.equal(update.controls.pane, null);
    assert.equal(update.controls.model, false);
    assert.equal(update.reveal, null);
  }
  for (const value of [snapshot([codex, codex]), snapshot([], target), null]) {
    assert.equal(
      projectAppControls(null, value, 'reader-1').controls.pane,
      null,
    );
  }
});
test('only a reported ready Codex pane projects informational Model, never a retained shell or coarse blocked action', () => {
  for (const [app, status, model] of [
    ['codex', 'idle', true],
    ['Codex', 'READY', true],
    ['codex', 'working', false],
    ['codex', 'blocked', false],
    ['codex', null, false],
    ['claude-code', 'idle', false],
    ['claude', 'blocked', false],
    ['cat', 'idle', false],
  ]) {
    const { controls } = projectAppControls(
      null,
      snapshot([{ ...codex, reportedApp: app, reportedStatus: status }]),
      'reader-1',
    );
    assert.equal(controls.model, model, `${app}/${status}`);
    assert.equal(controls.pane === null, !status || app === 'cat');
    assert(!Object.hasOwn(controls, 'capture'));
  }
});
test('selection/source changes reveal once, state changes retire Model and identical polls preserve projection identity', () => {
  const first = projectAppControls(null, snapshot(), 'reader-1');
  assert.deepEqual(first.reveal, target);
  const same = projectAppControls(
    first.controls,
    structuredClone(snapshot()),
    'reader-1',
  );
  assert.equal(same.controls, first.controls);
  assert.equal(same.reveal, null);
  const changed = projectAppControls(
    same.controls,
    snapshot([{ ...codex, reportedStatus: 'working' }]),
    'reader-1',
  );
  assert.equal(changed.controls.model, false);
  assert.equal(changed.controls.revision, first.controls.revision + 1);
  assert.equal(changed.reveal, null);
  const replaced = projectAppControls(changed.controls, snapshot(), 'reader-2');
  assert.deepEqual(replaced.reveal, target);
  assert.equal(replaced.controls.revision, changed.controls.revision + 1);
  const next = { ...target, terminal: 't2' };
  assert.deepEqual(
    projectAppControls(
      replaced.controls,
      snapshot([{ ...codex, target: next }], next),
      'reader-2',
    ).reveal,
    next,
  );
});
test('projection snapshots detach the selected pane from later reader mutation', () => {
  const input = structuredClone(snapshot());
  const { controls } = projectAppControls(null, input, 'reader-1');
  input.panes[0].target.terminal = 'replacement';
  input.panes[0].reportedStatus = 'working';
  assert.equal(controls.pane.target.terminal, 't1');
  assert.equal(controls.model, true);
});
