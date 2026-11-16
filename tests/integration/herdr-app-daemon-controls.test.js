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
        guard();
        runs.push([kind, address]);
        return { kind, label: kind === 'model' ? 'GPT 5.5' : 'high' };
      },
    },
  });
  return { h, runs, panes };
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
  assert.match(frame(h, 'herdr-app:1,0'), /Deck only/);

  await h.profilePress('herdr-app', 0, 1);
  assert.deepEqual(h.controller('herdr-app').selected(), ref(2));
  assert.match(frame(h, 'herdr-app:0,1'), />Deck only</);
  assert.doesNotMatch(frame(h, 'herdr-app:0,1'), />On deck</);
  await h.profilePress('herdr-app', 1, 2);
  assert.deepEqual(runs, [], 'controls stay inactive without input consent');
  assert.equal(h.calls.length, 0);
});

test('saved provider controls stay inactive through settings reload with every former opt-in enabled', async () => {
  const { h, runs } = setup();
  await h.appear('herdr-app');
  await preferences(h, {
    herdrAppHome: '/fixture-app-home',
    herdrAppCoreSocketPath: '/private/core.sock',
    herdrAppReadbackEnabled: true,
    herdrAppInputEnabled: true,
    herdrAppFocusRequestEnabled: true,
  });
  const app = h.controller('herdr-app');
  for (const action of ['model', 'effort', 'permissions']) {
    h.socket.emit(
      'message',
      JSON.stringify({
        event: 'didReceiveSettings',
        context: 'herdr-app:0,1',
        payload: { settings: { profileScope: 'herdr-app', action } },
      }),
    );
    await h.api.settled();
    const key = app.keys.get('herdr-app:0,1');
    assert.equal(key.settings.action, action);
    assert.equal(key.presented.action, 'none');
    h.tick(350);
    await h.profilePress('herdr-app', 0, 1);
  }
  assert.deepEqual(runs, []);
  assert.deepEqual(h.calls, []);
});
