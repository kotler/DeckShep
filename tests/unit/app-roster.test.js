'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AppRoster } = require('../../src/domain/app-roster');
const {
  appProvider,
  destinationName,
  paneKey,
  matchesAppTarget,
} = require('../../src/domain/app-navigation');

function target(number) {
  return {
    space: 'space',
    tab: 'tab',
    pane: 'p' + number,
    terminal: 't' + number,
  };
}
function snapshot(count = 7, selected = 1) {
  return {
    provenance: 'app-model',
    endpointGeneration: 1,
    verifiedFocus: false,
    panes: Array.from({ length: count }, (_, i) => ({
      target: target(i + 1),
      name: 'Agent ' + (i + 1),
      reportedApp: i % 2 ? 'claude' : 'codex',
      reportedStatus: 'idle',
    })),
    selected: selected === null ? null : target(selected),
  };
}

test('App selection reveals its bank once and later observations preserve Page browsing', () => {
  const roster = new AppRoster();
  const input = snapshot();
  roster.observe(input);
  input.selected = target(7);
  let view = roster.observe(input);
  assert.equal(view.bank, 1);
  assert.equal(view.appSelected.pane, 'p7');
  assert.equal(view.tiles[1].pane.target.pane, 'p7');
  assert.equal(roster.page().bank, 0);

  input.panes.reverse();
  input.panes.find((pane) => pane.target.pane === 'p7').reportedStatus =
    'working';
  input.panes.find((pane) => pane.target.pane === 'p7').name = 'Renamed';
  view = roster.observe(input);
  assert.equal(view.bank, 0);
  assert.equal(view.appSelected.pane, 'p7');
  assert.equal(view.tiles[0].pane.target.pane, 'p1');
  assert.equal(view.slots[6].pane, 'p7');

  input.selected = target(6);
  assert.equal(roster.observe(input).bank, 1);
});

test('selecting on the deck reveals the bank and supplies the next destination in one view', () => {
  const roster = new AppRoster();
  const input = snapshot();
  roster.observe(input);
  const view = roster.select(target(6));
  assert.equal(view.bank, 1);
  assert.equal(view.deckSelected.pane, 'p6');
  assert.equal(view.selected.pane, 'p6');
  assert.equal(view.appSelected.pane, 'p1');
  assert.equal(view.destinations.next.target.pane, 'p7');
  assert.equal(roster.observe(input).selected.pane, 'p6');

  input.panes.splice(5, 1);
  const closed = roster.observe(input);
  assert.equal(closed.deckSelected, null);
  assert.equal(closed.selected.pane, 'p1');
  assert.equal(closed.tiles[0].pane, undefined);
  assert.equal(closed.tiles[0].slot.pane, 'p6');
});

test('acknowledgement accepts the App selection before recording the confirmed deck choice', () => {
  const roster = new AppRoster();
  roster.observe(snapshot());
  const fresh = snapshot(7, 3);
  const acknowledged = roster.acknowledgeFocus(fresh, target(7));
  assert.equal(acknowledged.appSelected.pane, 'p3');
  assert.equal(acknowledged.deckSelected.pane, 'p7');
  assert.equal(acknowledged.selected.pane, 'p7');
  assert.equal(acknowledged.bank, 1);
  assert.equal(acknowledged.destinations.next.target.pane, 'p1');
  const repeated = roster.observe(fresh);
  assert.equal(repeated.bank, 1);
  assert.equal(repeated.deckSelected.pane, 'p7');

  fresh.selected = target(2);
  const changed = roster.observe(fresh);
  assert.equal(changed.bank, 0);
  assert.equal(changed.deckSelected, null);
  assert.equal(changed.selected.pane, 'p2');
});

test('reordered listings, restored agents and new arrivals preserve slots until Collapse', () => {
  const roster = new AppRoster();
  const input = snapshot();
  const first = roster.observe(input);
  const missing = input.panes.splice(1, 1)[0];
  const gap = roster.observe(input);
  assert.equal(gap.tiles[1].slot.pane, 'p2');
  assert.equal(gap.tiles[1].pane, undefined);
  assert.equal(gap.canCollapse, true);
  input.panes.reverse();
  input.panes.push(missing, { ...missing, target: target(8) });
  const restored = roster.observe(input);
  assert.deepEqual(restored.slots.slice(0, 7), first.slots);
  assert.equal(restored.slots[7].pane, 'p8');
  assert.equal(restored.tiles[1].pane.target.pane, 'p2');
  assert.equal(restored.canCollapse, false);

  roster.page();
  input.panes = input.panes.filter((pane) =>
    ['p1', 'p7'].includes(pane.target.pane),
  );
  roster.observe(input);
  const collapsed = roster.collapse();
  assert.deepEqual(collapsed.slots, [target(1), target(7)]);
  assert.equal(collapsed.bank, 0);
  assert.equal(collapsed.banks, 1);
  assert.equal(collapsed.canCollapse, false);
  assert.equal(collapsed.tiles[1].pane.target.pane, 'p7');
});

test('suspension disarms destinations and keeps gaps while reset starts a new roster at the same endpoint generation', () => {
  const roster = new AppRoster();
  const input = snapshot();
  const initial = roster.observe(input);
  roster.select(target(7));
  const suspended = roster.suspend();
  assert.equal(suspended.available, false);
  assert.equal(suspended.bank, 1);
  assert.equal(suspended.selected, null);
  assert.equal(suspended.deckSelected, null);
  assert.equal(suspended.destinations.next, undefined);
  assert.equal(suspended.destinations.attention, undefined);
  assert.equal(suspended.destinations['agent:0'], undefined);
  assert.deepEqual(suspended.slots, initial.slots);
  assert.equal(roster.collapse(), suspended);
  assert.equal(roster.page(), suspended);

  input.panes.shift();
  input.selected = target(7);
  const recovered = roster.observe(input);
  assert.equal(recovered.bank, 1);
  assert.equal(recovered.slots[0].pane, 'p1');
  roster.page();
  assert.equal(roster.observe(input).bank, 0);
  const reset = roster.reset();
  assert.equal(reset.bank, 0);
  assert.equal(reset.banks, 1);
  assert.equal(reset.slots.length, 0);

  input.selected = target(2);
  const replaced = roster.observe(input);
  assert.equal(replaced.slots[0].pane, 'p2');
  assert.equal(replaced.bank, 0);
  assert.equal(replaced.canCollapse, false);
});

test('captured Attention keeps its target and ranking facts while a fresh waiting agent overtakes it', () => {
  const roster = new AppRoster();
  const input = snapshot();
  input.panes[6].reportedStatus = 'blocked';
  const shown = roster.observe(input);
  const pane = shown.destinations.attention;
  const conditions = {
    action: 'attention',
    provider: appProvider(pane.reportedApp),
    name: destinationName(pane),
    reason: shown.attention.kind,
    appSelection: paneKey(shown.appSelected),
    effectiveSelection: paneKey(shown.selected),
  };
  assert.equal(pane.target.pane, 'p7');
  assert.equal(
    matchesAppTarget(input, pane.target, conditions, shown.slots),
    true,
  );
  input.panes[1].reportedStatus = 'blocked';
  const updated = roster.observe(input);
  assert.equal(updated.destinations.attention.target.pane, 'p2');
  assert.equal(shown.destinations.attention.target.pane, 'p7');
  assert.equal(shown.attention.kind, 'waiting');
  assert.equal(
    matchesAppTarget(input, pane.target, conditions, shown.slots),
    false,
  );
});

test('views detach and freeze pane facts, selections and slot order across later updates', () => {
  const roster = new AppRoster();
  const input = snapshot();
  input.panes[6].reportedStatus = 'blocked';
  roster.observe(input);
  const view = roster.select(target(6));
  const attention = view.destinations.attention;
  input.panes[6].name = 'Changed';
  input.panes[6].reportedStatus = 'idle';
  input.panes[6].target.terminal = 't99';
  input.selected.pane = 'p2';
  assert.equal(attention.name, 'Agent 7');
  assert.equal(attention.reportedStatus, 'blocked');
  assert.equal(attention.target.terminal, 't7');
  assert.equal(view.appSelected.pane, 'p1');
  for (const value of [
    view,
    view.slots,
    view.slots[0],
    view.tiles,
    view.tiles[0],
    view.tiles[0].pane,
    view.agents,
    view.destinations,
    attention,
    attention.target,
    view.attention,
    view.appSelected,
    view.deckSelected,
  ]) {
    assert(Object.isFrozen(value));
  }
  assert.throws(() => {
    view.slots[0].pane = 'replacement';
  }, TypeError);
  assert.throws(() => {
    attention.name = 'replacement';
  }, TypeError);
  roster.observe(input);
  roster.collapse();
  roster.reset();
  assert.equal(view.destinations.attention.target.terminal, 't7');
  assert.equal(view.destinations.next.target.pane, 'p7');
  assert.equal(view.bank, 1);
});

test('empty views, selected shells and page limits retain their navigation behavior', () => {
  const roster = new AppRoster();
  assert.equal(roster.view.tiles.length, 5);
  assert.equal(roster.view.available, false);
  assert.equal(roster.view.attention, undefined);
  const input = snapshot(12);
  input.panes[0].reportedStatus = null;
  let view = roster.observe(input);
  assert.equal(view.slots.length, 11);
  assert.equal(view.appSelected.pane, 'p1');
  assert.equal(view.destinations.next.target.pane, 'p2');
  assert.equal(roster.setBank(99).bank, 2);
  assert.equal(roster.page().bank, 0);
  assert.equal(roster.setBank(-1).bank, 0);
  assert.equal(roster.setBank(1.9).bank, 1);
  input.selected = null;
  input.panes = [];
  view = roster.observe(input);
  assert.equal(view.selected, null);
  view = roster.collapse();
  assert.equal(view.bank, 0);
  assert.equal(view.banks, 1);
  assert.equal(view.slots.length, 0);
});

test('unsupported destinations and invalid choices cannot partially replace a view', () => {
  const roster = new AppRoster();
  const view = roster.observe(snapshot());
  for (const action of [
    'model',
    'send',
    'constructor',
    'toString',
    '__proto__',
    'agent:99',
  ]) {
    assert.equal(view.destinations[action], undefined);
  }
  assert.throws(() => roster.select(target(99)), /Request stale/);
  assert.equal(roster.view, view);
  assert.throws(
    () => roster.acknowledgeFocus(snapshot(7, 3), target(99)),
    /Request stale/,
  );
  assert.equal(roster.view, view);
});
