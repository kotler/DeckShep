const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  appTile,
  appState,
  appProvider,
} = require('../../src/app/herdr-app-view');
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
  assert.deepEqual(shown.lines, ['Fix tests', 'WORKING', 'App reported']);
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
    label: 'UNKNOWN',
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
  assert.equal(shown.lines[0], 'my-agent');
});
