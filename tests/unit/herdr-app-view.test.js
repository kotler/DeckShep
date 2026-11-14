const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appTile, appState } = require('../../src/app/herdr-app-view');
const { appProvider } = require('../../src/domain/app-navigation');
const palette =
  require('../../com.kotl3r.deckshep.sdPlugin/config.json').palette;

const target = { space: 's1', tab: 'b1', pane: 'p1', terminal: 't1' };
function tile(pane, extra = {}) {
  return appTile({
    key: { settings: {}, coordinates: { row: 0, column: 0 }, appearance: 0 },
    pane,
    slot: pane?.target,
    selected: null,
    deckSelected: null,
    preview: false,
    online: true,
    consent: true,
    bank: 0,
    banks: 1,
    now: 0,
    palette,
    ...extra,
  });
}
test('App pane tiles use the shared status palette, provider icon and agent layout', () => {
  const shown = tile({
    target,
    reportedApp: 'codex',
    reportedStatus: 'working',
    name: 'Fix tests',
  });
  assert.equal(shown.agent, true);
  assert.equal(shown.icon, 'codex');
  assert.equal(shown.color, palette.working);
  assert.deepEqual(shown.lines, ['Fix tests', 'Request only', 'Working']);
  assert.equal(
    tile({
      target,
      reportedApp: 'claude',
      reportedStatus: 'blocked',
      name: null,
    }).icon,
    'claude-code',
  );
});
test('unknown App words fall back to neutral visuals and never invent a provider', () => {
  assert.equal(appProvider('my-agent'), null);
  assert.equal(appProvider(null), null);
  assert.deepEqual(appState('sleeping', palette), {
    label: 'Unknown',
    shape: 'unknown',
    color: palette.unknown,
  });
  assert.equal(appState('idle', palette).color, palette.ready);
  const shown = tile({
    target,
    reportedApp: 'my-agent',
    reportedStatus: null,
    name: null,
  });
  assert.equal(shown.icon, 'blank');
  assert.equal(shown.color, palette.unknown);
  assert.equal(shown.lines[0], 'Terminal');
});

test('stable slots retain gaps, ignore a selected shell and rank completed agents after waiting or errored peers', () => {
  const { appRoster } = require('../../src/domain/app-navigation');
  const panes = Array.from({ length: 7 }, (_, i) => ({
    target: { space: 's', tab: 'b', pane: 'p' + i, terminal: 't' + (i + 1) },
    name: 'Job ' + i,
    reportedApp: i ? 'codex' : null,
    reportedStatus: [
      null,
      'done',
      null,
      'blocked',
      'error',
      'ready',
      'blocked',
    ][i],
  }));
  const selected = panes[0].target;
  const project = (previous, listing, start = selected) =>
    appRoster(previous, { panes: listing, selected }, start);
  const first = project([], panes);
  assert.equal(first.slots.length, 6);
  assert.equal(first.next, panes[1]);
  assert.equal(first.attention.agent, panes[3]);
  const reversed = project(first.slots, panes.toReversed(), panes[3].target);
  assert.equal(reversed.attention.agent, panes[6]);
  assert.deepEqual(reversed.slots, first.slots);
  const last = project(first.slots, panes.slice(0, 3));
  assert.equal(last.attention.kind, 'done');
  assert.equal(last.entries[5], undefined);
});
test('reconciliation reads each retained reference a bounded number of times as closed slots accumulate', () => {
  const { appRoster } = require('../../src/domain/app-navigation');
  function work(count) {
    let reads = 0;
    const slots = Array.from({ length: count }, (_, i) => ({
      space: 's',
      tab: 'b',
      get pane() {
        reads++;
        return 'p' + i;
      },
      terminal: 't' + (i + 1),
    }));
    const cohort = slots.slice(-5).map((target) => ({
      target,
      reportedApp: 'codex',
      reportedStatus: 'idle',
      name: null,
    }));
    const result = appRoster(slots, { panes: cohort, selected: null }, null);
    assert.equal(result.slots.length, count);
    assert.equal(result.occupied.length, 5);
    return reads;
  }
  const small = work(64),
    large = work(128);
  assert(small >= 64);
  assert(large <= 2 * small && large < 128 * 4);
});
