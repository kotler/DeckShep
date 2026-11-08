const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');
const { appControllerBackend } = require('../helpers/app-controller-backend');
const { appFocusBackend } = require('../../src/app/herdr-app-backend');
const { APP_FOCUS_RECORDS } = require('../../src/terminals/herdr-app/peer');
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
function frame(h, context) {
  return Buffer.from(
    h.controller('herdr-app').keys.get(context).lastImage.split(',')[1],
    'base64',
  ).toString();
}
async function fixture(t) {
  const peer = await appControllerBackend(t),
    h = harness({ experimentalHerdrApp: true, appFocusBackend: peer.backend });
  await h.appear('herdr-app');
  await preferences(h, { herdrAppHome: peer.home });
  h.tick(350);
  return { h, peer, app: h.controller('herdr-app') };
}
test('App routing uses real request guards with separate consent, selection/Next and no provider identity', async (t) => {
  const { h, peer, app } = await fixture(t);
  await preferences(h, {
    herdrAppReadbackEnabled: true,
    herdrAppInputEnabled: true,
    claudeEnabled: true,
  });
  h.tick(350);
  await h.profilePress('herdr-app', 0, 1);
  assert.deepEqual(
    peer.inputs(),
    [],
    'old read-back/input flags never authorize focus requests',
  );
  await preferences(h, {
    herdrAppFocusRequestEnabled: true,
    herdrAppReadbackEnabled: false,
    herdrAppInputEnabled: false,
  });
  await h.profilePress('herdr-app', 0, 1);
  assert.deepEqual(peer.inputs(), [], '350ms context arming is retained');
  h.tick(350);
  await h.profilePress('herdr-app', 0, 1);
  assert.deepEqual(peer.inputs(), [{ do: 'pane.focus', args: { pane: 'p2' } }]);
  assert.match(frame(h, 'herdr-app:0,1'), /Focus requested/);
  assert.match(frame(h, 'herdr-app:0,1'), /Not verified/);
  h.tick(2500);
  app.render();
  assert.match(frame(h, 'herdr-app:0,1'), /Deck selected/);
  assert(!Object.hasOwn(app.selected(), 'pid'));
  assert(!Object.hasOwn(app.selected(), 'chatId'));
  h.tick(350);
  await h.profilePress('herdr-app', 1, 1);
  assert.equal(peer.inputs().at(-1).args.pane, 'p3');
  assert.equal(h.calls.length, 0);
  assert.equal(h.api.bridge.config.allowClipboardFocus, false);
});
test('App banks and Collapse are local, closed/remapped slots and custom input actions never dispatch', async (t) => {
  const { h, peer, app } = await fixture(t);
  await preferences(h, { herdrAppFocusRequestEnabled: true });
  h.tick(350);
  await h.profilePress('herdr-app', 2, 0);
  assert.equal(app.getBank(), 1);
  assert.match(frame(h, 'herdr-app:0,0'), /Pane 6/);
  peer.world.spaces[0].tabs[0].terminals.splice(5, 1);
  await app.refresh();
  assert.match(frame(h, 'herdr-app:0,0'), /Closed pane/);
  await h.profilePress('herdr-app', 0, 0);
  assert.deepEqual(peer.inputs(), []);
  await h.profilePress('herdr-app', 1, 0);
  assert.match(frame(h, 'herdr-app:0,0'), /Pane 7/);
  for (const action of [
    'zoom',
    'answer',
    'interrupt',
    'send',
    'requestFocus',
    'agent:99',
  ]) {
    const key = app.keys.get('herdr-app:1,2');
    key.settings = { action };
    app.render();
    await h.profilePress('herdr-app', 1, 2);
  }
  assert.deepEqual(peer.inputs(), []);
});
test('consent revocation bypasses the event queue and invalidates a paused final App write', async (t) => {
  const { h, peer } = await fixture(t);
  await preferences(h, { herdrAppFocusRequestEnabled: true });
  h.tick(350);
  const paused = peer.pause();
  const press = h.profilePress('herdr-app', 0, 1);
  await paused;
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'sendToPlugin',
      context: 'herdr-app:0,0',
      payload: {
        kind: 'preferences',
        preferences: { herdrAppFocusRequestEnabled: false },
      },
    }),
  );
  assert.equal(
    h.controller('herdr-app').bridge.config.herdrApp.focusRequestEnabled,
    false,
  );
  peer.release();
  await press;
  assert.deepEqual(peer.inputs(), []);
  const saved = h.socket.frames
    .filter((frame) => frame.event === 'setGlobalSettings')
    .at(-1).payload;
  assert.equal(saved.profiles['herdr-app'].herdrAppFocusRequestEnabled, false);
});
test('profile disappearance, new appearance and configuration changes refuse captured App presses', async (t) => {
  const { h, peer, app } = await fixture(t);
  await preferences(h, { herdrAppFocusRequestEnabled: true });
  h.tick(350);
  const key = app.keys.get('herdr-app:0,1'),
    display = { ...key.presented, pressedAt: 10350 };
  app.detach('herdr-app:0,1');
  app.attach('herdr-app:0,1', {
    settings: {},
    coordinates: { row: 0, column: 1 },
  });
  await app.press('herdr-app:0,1', display);
  assert.deepEqual(peer.inputs(), []);
  const paused = peer.pause(),
    press = h.profilePress('herdr-app', 0, 1);
  await paused;
  h.hide('herdr-app');
  peer.release();
  await press;
  assert.deepEqual(peer.inputs(), []);
});
test('empty production records block discovery and focus even with configured home and all opt-ins enabled', async () => {
  assert.deepEqual(APP_FOCUS_RECORDS, []);
  assert.equal(appFocusBackend.recordCount, 0);
  const h = harness({ experimentalHerdrApp: true });
  await h.appear('herdr-app');
  await preferences(h, {
    herdrAppHome: '/unavailable-app-home',
    herdrAppFocusRequestEnabled: true,
    herdrAppReadbackEnabled: true,
    herdrAppInputEnabled: true,
    claudeEnabled: true,
  });
  h.tick(350);
  await h.profilePress('herdr-app', 0, 1);
  await h.profilePress('herdr-app', 1, 1);
  assert.match(frame(h, 'herdr-app:0,1'), /Preview only/);
  assert.deepEqual(h.calls, []);
});
