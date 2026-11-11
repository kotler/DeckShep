const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');

const ref = (n) => ({
  space: 's1',
  tab: 'b1',
  pane: 'p' + n,
  terminal: 't' + n,
});
function setup({ state = 'idle' } = {}) {
  const panes = [1, 2].map((n) => ({
    target: ref(n),
    reportedApp: 'codex',
    reportedStatus: n === 2 ? state : 'idle',
    name: 'Pane ' + n,
  }));
  const runs = [];
  let fail = null;
  const h = harness({
    experimentalHerdrApp: true,
    appSelectionReader: () => ({
      observe: async () => ({
        provenance: 'app-model',
        endpointGeneration: 1,
        panes: structuredClone(panes),
        selected: ref(1),
        verifiedFocus: false,
      }),
      dispose() {},
    }),
    appCoreStatus: () => ({
      read: async () => ({
        provenance: 'core-listing',
        coreId: 'c',
        terminals: panes.map((pane) => ({
          address: pane.target.terminal,
          name: null,
          title: null,
          state: pane.reportedStatus,
          app: 'codex',
          statusTitle: null,
          kind: null,
        })),
      }),
      terminal: async (address) => ({ address, pid: 1, cwd: '/w', title: 'x' }),
      close() {},
    }),
    appCodexControls: {
      async run(kind, core, address, guard) {
        if (fail) fail();
        guard();
        runs.push([kind, address]);
        return { kind, label: kind === 'model' ? 'GPT 5.5' : 'high' };
      },
    },
  });
  return { h, runs, panes, setFail: (f) => (fail = f) };
}
async function preferences(h, patch) {
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'sendToPlugin',
      context: 'herdr-app:0,0',
      payload: { kind: 'preferences', preferences: patch },
    }),
  );
  await h.api.settled();
}
const frame = (h, context) =>
  Buffer.from(
    h.controller('herdr-app').keys.get(context).lastImage.split(',')[1],
    'base64',
  ).toString();

test('without an approved build App panes are discovered read-only and agent keys select locally', async () => {
  const { h, runs } = setup();
  await h.appear('herdr-app');
  await preferences(h, { herdrAppHome: '/fixture-app-home' });
  h.tick(350);
  assert.doesNotMatch(frame(h, 'herdr-app:0,1'), /Preview only/);
  assert.match(frame(h, 'herdr-app:0,1'), /Pane 2/);
  assert.match(frame(h, 'herdr-app:1,1'), /Deck only/);
  assert.match(frame(h, 'herdr-app:1,2'), /Consent off/);
  await h.profilePress('herdr-app', 0, 1);
  assert.deepEqual(h.controller('herdr-app').selected(), ref(2));
  assert.match(frame(h, 'herdr-app:0,1'), />Deck selected</);
  await h.profilePress('herdr-app', 1, 2);
  assert.deepEqual(runs, [], 'controls stay inactive without input consent');
  assert.equal(h.calls.length, 0);
});
test('consented daemon controls act on the deck-selected ready Codex pane only', async () => {
  const { h, runs, setFail } = setup();
  await h.appear('herdr-app');
  await preferences(h, {
    herdrAppHome: '/fixture-app-home',
    herdrAppCoreSocketPath: '/private/core.sock',
    herdrAppReadbackEnabled: true,
    herdrAppInputEnabled: true,
  });
  h.tick(350);
  await h.profilePress('herdr-app', 0, 1);
  h.tick(350);
  assert.match(frame(h, 'herdr-app:1,3'), />Codex<\/text><text[^>]*>daemon</);
  await h.profilePress('herdr-app', 1, 3);
  assert.deepEqual(runs, [['effort', 't2']]);
  assert.match(frame(h, 'herdr-app:1,3'), /high/);
  h.tick(2600);
  h.controller('herdr-app').render();
  setFail(() => {
    throw Error('Pane, chat or daemon changed: /private/secret');
  });
  await h.profilePress('herdr-app', 1, 2);
  assert.match(
    frame(h, 'herdr-app:1,2'),
    />Control<\/text><text[^>]*>refused</,
  );
  assert.doesNotMatch(frame(h, 'herdr-app:1,2'), /secret/);
  setFail(null);
  h.tick(2600);
  await preferences(h, { herdrAppInputEnabled: false });
  h.tick(350);
  await h.profilePress('herdr-app', 1, 3);
  assert.equal(runs.length, 1, 'revoked consent unmaps the control');
  assert.equal(h.calls.length, 0);
});
test('blocked or working Codex panes show Answer in Herdr / Wait and never run controls', async () => {
  for (const [state, text] of [
    ['blocked', />Answer<\/text><text[^>]*>in Herdr</],
    ['working', />Wait for<\/text><text[^>]*>ready</],
  ]) {
    const { h, runs } = setup({ state });
    await h.appear('herdr-app');
    await preferences(h, {
      herdrAppHome: '/fixture-app-home',
      herdrAppCoreSocketPath: '/private/core.sock',
      herdrAppReadbackEnabled: true,
      herdrAppInputEnabled: true,
    });
    h.tick(350);
    await h.profilePress('herdr-app', 0, 1);
    h.tick(350);
    assert.match(frame(h, 'herdr-app:1,2'), text);
    await h.profilePress('herdr-app', 1, 2);
    assert.deepEqual(runs, []);
  }
});
