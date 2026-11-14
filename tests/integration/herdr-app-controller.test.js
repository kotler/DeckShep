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
async function fixture(t, extra = {}) {
  const peer = await appControllerBackend(t),
    h = harness({
      experimentalHerdrApp: true,
      appFocusBackend: peer.backend,
      ...extra,
    });
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
  assert.match(
    frame(h, 'herdr-app:0,1'),
    />Focus<\/text><text[^>]*>requested</,
  );
  assert.match(frame(h, 'herdr-app:0,1'), /Not verified/);
  h.tick(2500);
  app.render();
  assert.match(frame(h, 'herdr-app:0,1'), />On deck</);
  assert(!Object.hasOwn(app.selected(), 'pid'));
  assert(!Object.hasOwn(app.selected(), 'chatId'));
  h.tick(350);
  await h.profilePress('herdr-app', 1, 0);
  assert.equal(peer.inputs().at(-1).args.pane, 'p3');
  assert.equal(h.calls.length, 0);
  assert.equal(h.api.bridge.config.allowClipboardFocus, false);
});
test('App banks and Collapse are local, closed/remapped slots and custom input actions never dispatch', async (t) => {
  const { h, peer, app } = await fixture(t);
  await preferences(h, { herdrAppFocusRequestEnabled: true });
  h.tick(350);
  await h.profilePress('herdr-app', 1, 1);
  assert.equal(app.getBank(), 1);
  assert.match(frame(h, 'herdr-app:0,0'), /Pane 6/);
  peer.world.spaces[0].tabs[0].terminals.splice(5, 1);
  await app.refresh();
  assert.match(frame(h, 'herdr-app:0,0'), /Closed pane/);
  await h.profilePress('herdr-app', 0, 0);
  assert.deepEqual(peer.inputs(), []);
  h.tick(350);
  await h.profilePress('herdr-app', 1, 2);
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
  h.tick(350);
  const paused = peer.pause(),
    press = h.profilePress('herdr-app', 0, 1);
  await paused;
  h.hide('herdr-app');
  peer.release();
  await press;
  assert.deepEqual(peer.inputs(), []);
});
test('empty production records block focus (discovery is read-only) even with configured home and all opt-ins enabled', async () => {
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
  assert.doesNotMatch(frame(h, 'herdr-app:0,1'), /Preview only/);
  assert.match(frame(h, 'herdr-app:0,1'), /Unavailable/);
  assert.deepEqual(h.calls, []);
});

test('inspector Refresh status performs a new read and reports its result without focus or provider calls', async (t) => {
  const { h, peer } = await fixture(t);
  const send = async (kind) => {
    h.socket.emit(
      'message',
      JSON.stringify({
        event: 'sendToPlugin',
        context: 'herdr-app:0,0',
        payload: { kind },
      }),
    );
    await h.api.settled();
  };
  const before = peer.peer.calls.length;
  await send('status');
  assert.equal(peer.peer.calls.length, before, 'periodic status is passive');
  peer.world.spaces[0].tabs[0].terminals.pop();
  await send('refresh');
  assert.equal(
    peer.peer.calls.length,
    before + 3,
    'explicit refresh reads status/ls/status',
  );
  const status = h.socket.frames
    .filter(
      (f) =>
        f.event === 'sendToPropertyInspector' && f.payload.kind === 'status',
    )
    .at(-1).payload;
  assert.equal(status.agents, 6);
  assert.equal(status.offline, false);
  assert.equal(status.message, 'App status refreshed');
  assert.deepEqual(peer.inputs(), []);
  assert.deepEqual(h.calls, []);
  peer.status.overlays = ['blocked'];
  await send('refresh');
  const refused = h.socket.frames
    .filter(
      (f) =>
        f.event === 'sendToPropertyInspector' && f.payload.kind === 'status',
    )
    .at(-1).payload;
  assert.equal(refused.offline, true);
  assert.match(refused.message, /No matched App connection/);
  assert.deepEqual(peer.inputs(), []);
});

test('inspector Core count requires readback consent and Core titles never change actionable faces', async (t) => {
  const reads = [];
  const facts = {
    address: 't2',
    name: null,
    title: null,
    state: 'idle',
    app: 'codex',
    statusTitle: 'Auth fix',
    kind: null,
  };
  const { h, peer, app } = await fixture(t, {
    appCoreStatus: (config) => ({
      async read() {
        reads.push(config.herdrApp.coreSocketPath);
        return { provenance: 'core-listing', coreId: 'c', terminals: [facts] };
      },
      close() {},
    }),
  });
  await preferences(h, { herdrAppCoreSocketPath: '/private/core.sock' });
  assert.deepEqual(reads, [], 'socket alone does not consent to reads');
  assert.doesNotMatch(frame(h, 'herdr-app:0,1'), /Auth fix/);
  const before = app.keys.get('herdr-app:0,1').presented.target;
  await preferences(h, { herdrAppReadbackEnabled: true });
  assert(reads.length > 0);
  assert.doesNotMatch(frame(h, 'herdr-app:0,1'), /Auth fix/);
  assert.match(frame(h, 'herdr-app:0,1'), /Pane 2/);
  assert.match(frame(h, 'herdr-app:0,1'), /Ready/);
  assert.deepEqual(app.keys.get('herdr-app:0,1').presented.target, before);
  const inspector = async () => {
    await app.inspectorRequest({
      context: 'herdr-app:0,0',
      payload: { kind: 'status' },
    });
    return h.socket.frames
      .filter((f) => f.event === 'sendToPropertyInspector')
      .at(-1).payload;
  };
  assert.equal((await inspector()).coreCount, 1);
  facts.state = 'working';
  await app.refresh();
  assert.doesNotMatch(
    frame(h, 'herdr-app:0,1'),
    /Auth fix/,
    'App/core disagreement keeps App-only text',
  );
  facts.state = 'idle';
  await app.refresh();
  await preferences(h, { herdrAppReadbackEnabled: false });
  assert.equal((await inspector()).coreCount, undefined);
  assert.doesNotMatch(frame(h, 'herdr-app:0,1'), /Auth fix/);
  assert.deepEqual(peer.inputs(), []);
  assert.equal(h.calls.length, 0);
});

for (const focus of [false, true]) {
  test(`Attention visits the other bank with one fresh App observation (focus=${focus})`, async (t) => {
    const { h, app, peer } = await fixture(t);
    const terms = peer.world.spaces[0].tabs[0].terminals;
    Object.assign(terms[5], {
      app: 'claude',
      status: 'blocked',
      name: 'Review',
    });
    terms[1].status = 'error';
    await preferences(h, { herdrAppFocusRequestEnabled: focus });
    await app.refresh();
    const shown = () => app.keys.get('herdr-app:1,4').presented;
    assert.equal(shown().target.pane, 'p6');
    h.tick(350);
    const start = peer.peer.calls.length;
    await h.profilePress('herdr-app', 1, 4);
    assert.deepEqual(peer.peer.calls.slice(start), [
      ...(focus ? [{ commands: true }] : []),
      { status: true },
      { ls: true },
      { status: true },
      ...(focus ? [{ do: 'pane.focus', args: { pane: 'p6' } }] : []),
    ]);
    assert.equal(app.getBank(), 1);
    assert.equal(app.selected().pane, 'p6');
    assert.match(frame(h, 'herdr-app:0,0'), />On deck</);
    assert.doesNotMatch(frame(h, 'herdr-app:0,0'), /id="selected-agent"/);
    await app.refresh();
    assert.equal(app.selected().pane, 'p6');
    if (focus) {
      assert.equal(shown().action, 'none');
      h.tick(400);
      const count = peer.peer.calls.length;
      await h.profilePress('herdr-app', 1, 4);
      assert.equal(peer.peer.calls.length, count);
      h.tick(2100);
      const start = h.socket.frames.length;
      app.render();
      assert.deepEqual(
        h.socket.frames
          .slice(start)
          .filter((f) => f.event === 'setImage')
          .map((f) => f.context),
        ['herdr-app:1,4'],
      );
      assert.equal(shown().target.pane, 'p2');
      await h.profilePress('herdr-app', 1, 4);
      assert.equal(peer.peer.calls.length, count);
    }
    h.tick(350);
    await h.profilePress('herdr-app', 1, 1);
    assert.match(frame(h, 'herdr-app:0,0'), /id="selected-agent"/);
    Object.assign(peer.status, { focused_pane: 'p6', agent: 't6' });
    await app.refresh();
    h.tick(350);
    await h.profilePress('herdr-app', 1, 1);
    assert.match(frame(h, 'herdr-app:0,0'), /id="selected-agent"/);
    assert.doesNotMatch(frame(h, 'herdr-app:0,0'), />On deck</);
    Object.assign(peer.status, { focused_pane: 'p7', agent: 't7' });
    await app.refresh();
    assert.match(frame(h, 'herdr-app:0,1'), /id="selected-agent"/);
    assert.deepEqual(h.calls, []);
  });

  test(`Attention never redirects when the displayed agent recovers before preflight (focus=${focus})`, async (t) => {
    const { h, app, peer } = await fixture(t);
    const terms = peer.world.spaces[0].tabs[0].terminals;
    terms[5].status = 'blocked';
    await preferences(h, { herdrAppFocusRequestEnabled: focus });
    await app.refresh();
    h.tick(350);
    terms[5].status = 'idle';
    terms[2].status = 'blocked';
    await h.profilePress('herdr-app', 1, 4);
    assert.deepEqual(peer.inputs(), []);
    assert.equal(app.selected().pane, 'p1');
    assert.equal(app.getBank(), 0);
    assert.match(frame(h, 'herdr-app:1,4'), /Press again/);
    await app.refresh();
    h.tick(400);
    await h.profilePress('herdr-app', 1, 4);
    assert.equal(app.selected().pane, 'p1');
    assert.deepEqual(peer.inputs(), []);
  });
}
test('wire reorder and status alone preserve Next arming on the displayed destination', async (t) => {
  const { h, app, peer } = await fixture(t);
  const terms = peer.world.spaces[0].tabs[0].terminals;
  terms[0].app = null;
  terms[1].status = null;
  await app.refresh();
  const next = () => app.keys.get('herdr-app:1,0').presented;
  const { stamp, armedAt, target } = next();
  assert.equal(target.pane, 'p2');
  assert.match(frame(h, 'herdr-app:0,1'), /Unknown/);
  terms.reverse();
  terms.find((p) => p.pane === 'p2').status = 'idle';
  await app.refresh();
  assert.equal(next().stamp, stamp);
  assert.equal(next().armedAt, armedAt);
  h.tick(350);
  await h.profilePress('herdr-app', 1, 0);
  assert.equal(app.selected().pane, 'p2');
  assert.deepEqual(peer.inputs(), []);
});
test('an invalid fresh local Attention observation disarms all keys until a successful new observation', async (t) => {
  const { h, app, peer } = await fixture(t);
  peer.world.spaces[0].tabs[0].terminals[5].status = 'done';
  await app.refresh();
  h.tick(350);
  peer.status.overlays = ['open'];
  await h.profilePress('herdr-app', 1, 4);
  assert.equal(app.selected(), null);
  await h.profilePress('herdr-app', 0, 1);
  assert.equal(app.keys.get('herdr-app:0,1').presented.action, 'none');
  assert.deepEqual(peer.inputs(), []);
  peer.status.overlays = [];
  await app.refresh();
  assert.equal(app.keys.get('herdr-app:0,1').presented.action, 'agent:1');
});

function observerFixture() {
  const panes = Array.from({ length: 6 }, (_, i) => ({
    target: {
      space: 'space',
      tab: 'tab',
      pane: 'p' + (i + 1),
      terminal: 't' + (i + 1),
    },
    name: 'Pane ' + (i + 1),
    reportedApp: 'codex',
    reportedStatus: i === 5 ? 'blocked' : 'idle',
  }));
  let gate,
    reads = 0,
    active = 0,
    maxActive = 0,
    creations = 0;
  const reader = () => ({
    id: ++creations,
    async observe() {
      reads++;
      maxActive = Math.max(++active, maxActive);
      try {
        const snapshot = {
          provenance: 'app-model',
          endpointGeneration: 1,
          panes: structuredClone(panes),
          selected: panes[0].target,
          verifiedFocus: false,
        };
        if (gate) {
          const wait = gate;
          gate = null;
          await wait;
        }
        return snapshot;
      } finally {
        active--;
      }
    },
    dispose() {},
  });
  return {
    panes,
    reader,
    get reads() {
      return reads;
    },
    get maxActive() {
      return maxActive;
    },
    pause() {
      let release;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}
test('Attention reserves the reader through a timer poll, then reads again within the original queue budget', async () => {
  for (const elapsed of [10, 2001]) {
    const view = observerFixture();
    const h = harness({
      experimentalHerdrApp: true,
      appSelectionReader: view.reader,
    });
    await h.appear('herdr-app');
    await preferences(h, { herdrAppHome: '/fixture/one' });
    h.tick(350);
    const app = h.controller('herdr-app'),
      start = view.reads,
      release = view.pause(),
      poll = app.refresh();
    const press = h.profilePress('herdr-app', 1, 4);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(view.reads, start + 1);
    h.tick(elapsed);
    release();
    await poll;
    await press;
    assert.equal(view.maxActive, 1);
    assert.equal(view.reads, start + (elapsed > 2000 ? 1 : 2));
    assert.equal(app.selected().pane, elapsed > 2000 ? 'p1' : 'p6');
  }
});
test('a late reader cannot replace a new source with the same numeric endpoint generation', async () => {
  const view = observerFixture();
  const h = harness({
    experimentalHerdrApp: true,
    appSelectionReader: view.reader,
    appFocusBackend: {
      recordCount: 1,
      helperAvailable: () => true,
      create() {
        throw Error('Build mismatch');
      },
    },
  });
  await h.appear('herdr-app');
  await preferences(h, {
    herdrAppHome: '/fixture/one',
    herdrAppFocusRequestEnabled: true,
  });
  h.tick(350);
  const app = h.controller('herdr-app');
  assert.match(frame(h, 'herdr-app:0,1'), /Deck only/);
  await h.profilePress('herdr-app', 1, 4);
  assert.equal(app.getBank(), 1);
  const release = view.pause(),
    late = app.refresh();
  view.panes.splice(2);
  view.panes[1].name = 'New view';
  await preferences(h, { herdrAppHome: '/fixture/two' });
  assert.equal(app.getBank(), 0);
  assert.equal(app.selected().pane, 'p1');
  const key = app.keys.get('herdr-app:0,1');
  assert.equal(key.presented.endpointGeneration, 1);
  assert.equal(key.presented.conditions.name, 'New view');
  release();
  await late;
  assert.equal(key.presented.conditions.name, 'New view');
  assert.equal(app.keys.get('herdr-app:1,1').presented.action, 'none');
});
test('closing an idle third agent redraws only that slot and Collapse, with zero warm-cache draws', async () => {
  const view = observerFixture();
  view.panes.splice(3);
  const visuals = require('../../src/render/visuals');
  let draws = 0;
  const h = harness({
    experimentalHerdrApp: true,
    appSelectionReader: view.reader,
    renderer: {
      ...visuals,
      svg(spec) {
        draws++;
        return visuals.svg(spec);
      },
    },
  });
  await h.appear('herdr-app');
  await preferences(h, { herdrAppHome: '/fixture/one' });
  const app = h.controller('herdr-app');
  const third = view.panes[2];
  for (const warm of [false, true]) {
    const start = h.socket.frames.length,
      before = draws;
    view.panes.pop();
    await app.refresh();
    assert.equal(draws - before, warm ? 0 : 2);
    assert.deepEqual(
      h.socket.frames
        .slice(start)
        .filter((f) => f.event === 'setImage')
        .map((f) => f.context),
      ['herdr-app:0,2', 'herdr-app:1,2'],
    );
    const frames = h.socket.frames.length;
    h.tick(350);
    app.render();
    await app.refresh();
    assert.equal(h.socket.frames.length, frames);
    view.panes.push(third);
    await app.refresh();
  }
});

test('a queued key-down expires if its override changes away from Attention and back', async () => {
  const view = observerFixture();
  const h = harness({
    experimentalHerdrApp: true,
    appSelectionReader: view.reader,
  });
  await h.appear('herdr-app');
  await preferences(h, { herdrAppHome: '/fixture/one' });
  const app = h.controller('herdr-app'),
    context = 'herdr-app:1,4';
  h.tick(350);
  const release = view.pause(),
    poll = app.refresh();
  const press = h.profilePress('herdr-app', 1, 4);
  await new Promise((resolve) => setImmediate(resolve));
  const remap = (action) =>
    h.socket.emit(
      'message',
      JSON.stringify({
        event: 'didReceiveSettings',
        context,
        payload: { settings: { profileScope: 'herdr-app', action } },
      }),
    );
  remap('next');
  remap('');
  release();
  await poll;
  await press;
  assert.equal(app.selected().pane, 'p1');
  assert.match(frame(h, context), /Press again/);
  assert.equal(app.keys.get(context).presented.action, 'none');
  h.tick(2500);
  app.render();
  assert.equal(app.keys.get(context).presented.action, 'attention');
  assert.ok(app.keys.get(context).presented.armedAt > h.tick(0));
});

test('verified Attention waits for a running poll and rechecks the original one-second request deadline', async (t) => {
  for (const elapsed of [25, 1000]) {
    const { h, app, peer } = await fixture(t);
    peer.world.spaces[0].tabs[0].terminals[5].status = 'blocked';
    await preferences(h, { herdrAppFocusRequestEnabled: true });
    h.tick(350);
    const paused = peer.pauseListing(),
      poll = app.refresh(),
      release = await paused;
    const press = h.profilePress('herdr-app', 1, 4);
    await new Promise((resolve) => setImmediate(resolve));
    h.tick(elapsed);
    const start = peer.peer.calls.length;
    release();
    await poll;
    await press;
    const calls = peer.peer.calls.slice(start);
    assert.equal(
      calls.filter((c) => c.commands).length,
      elapsed === 25 ? 1 : 0,
    );
    assert.equal(calls.filter((c) => c.ls).length, elapsed === 25 ? 1 : 0);
    assert.equal(peer.inputs().length, elapsed === 25 ? 1 : 0);
    assert.equal(app.selected().pane, elapsed === 25 ? 'p6' : 'p1');
  }
});
test('a lost reply after Attention dispatch shows uncertainty and a repeated press cannot retry', async (t) => {
  const { h, app, peer } = await fixture(t);
  peer.world.spaces[0].tabs[0].terminals[5].status = 'error';
  await preferences(h, { herdrAppFocusRequestEnabled: true });
  h.tick(350);
  peer.dropFocusReply();
  await h.profilePress('herdr-app', 1, 4);
  assert.equal(peer.inputs().length, 1);
  assert.equal(app.selected(), null);
  assert.match(frame(h, 'herdr-app:1,4'), /uncertain/i);
  h.tick(400);
  await app.refresh();
  await h.profilePress('herdr-app', 1, 4);
  assert.equal(peer.inputs().length, 1);
});
