const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  HerdrAppBackend,
  HERDR_APP_FIXTURE_VERSION,
} = require('../../src/terminals/herdr-app/backend');
const {
  migrateV3,
  rollbackV2,
  experimentalScope,
} = require('../../src/app/experimental-preferences');
const legacy = require('../../src/app/preferences');
const agent = {
  session: 'fixture',
  block: 't1',
  pid: 42,
  app: 'codex',
  name: 'codex',
  state: 'idle',
};
test('Herdr App fixture contract: strict version gate, read-only discovery/native focus, generation and disposal', async () => {
  let version = '0.1.13',
    reads = 0,
    disposed = false;
  const backend = new HerdrAppBackend({
    version: async () => version,
    snapshot: async () => {
      reads++;
      return { agents: [agent], focused: agent };
    },
    dispose: async () => {
      disposed = true;
    },
  });
  assert.equal(
    (await backend.connect(new AbortController().signal)).capabilities.size,
    0,
  );
  await assert.rejects(backend.discover(), /unverified/);
  assert.equal(reads, 0);
  version = HERDR_APP_FIXTURE_VERSION;
  await backend.connect(new AbortController().signal);
  assert.deepEqual(await backend.discover(), [agent]);
  assert.deepEqual(await backend.focused(), agent);
  for (const input of [
    { kind: 'keys', keys: ['Enter'] },
    { kind: 'paste', text: 'fixture' },
    { kind: 'focus' },
    { kind: 'zoom' },
    { kind: 'selectWindow' },
    { kind: 'providerMutation', method: 'settings' },
  ])
    await assert.rejects(backend.deliver(agent, input, {}), /disabled/);
  await assert.rejects(backend.focus(agent), /unverified/);
  await assert.rejects(backend.zoom(agent), /unverified/);
  const generation = backend.generation;
  await backend.dispose();
  assert(disposed);
  assert(backend.generation > generation);
  await assert.rejects(backend.focused());
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(backend.connect(abort.signal));
});
test('v3 reservation round-trips and rolls back without changing v2 wire settings or enabling anything', () => {
  const v2 = legacy.store({
    version: 1,
    preferences: {
      allowClipboardFocus: true,
      claudeEnabled: false,
      herdrSocketPath: '/tmp/fixture.sock',
      prompts: { review: 'custom text' },
    },
  });
  const before = JSON.stringify(legacy.serialize(v2));
  const v3 = migrateV3(v2);
  assert.equal(v3.version, 3);
  assert.equal(v3.experimental.herdrApp, false);
  assert.deepEqual(migrateV3(JSON.parse(JSON.stringify(v3))), v3);
  assert.equal(JSON.stringify(legacy.serialize(rollbackV2(v3))), before);
  assert.equal(experimentalScope({ profileScope: 'herdr-app' }, false), null);
  assert.equal(
    experimentalScope({ profileScope: 'herdr-app' }, true),
    'herdr-app',
  );
  for (const bad of [
    { ...v3, experimental: { herdrApp: 'true' } },
    { ...v3, profiles: { ...v3.profiles, 'herdr-app': { sendKeys: true } } },
    { version: 4 },
  ])
    assert.throws(() => migrateV3(bad));
});
test('experimental codec keeps shared edits and opt-ins independent across explicit migration and rollback', () => {
  const { preferenceCodec } = require('../../src/app/experimental-preferences');
  assert.equal(preferenceCodec(false), legacy);
  const codec = preferenceCodec(true),
    initial = codec.store({
      version: 1,
      preferences: { allowClipboardFocus: true, herdrTitleIdentity: true },
    });
  initial.experimental.herdrApp = true;
  const updated = codec.update(initial, 'herdr', {
    claudeEnabled: true,
    prompts: { tests: 'run fixture tests' },
  });
  assert.equal(updated.profiles.rex.allowClipboardFocus, true);
  assert.equal(updated.profiles.herdr.claudeEnabled, true);
  assert.equal(updated.profiles.rex.claudeEnabled, undefined);
  assert.equal(updated.experimental.herdrApp, true);
  assert.deepEqual(codec.serialize(updated), updated);
  assert.equal(
    codec.profileConfig(
      require('../../com.local.rexagents.sdPlugin/config.json'),
      updated,
      'herdr',
    ).backend,
    'herdr',
  );
  assert.equal(rollbackV2(updated).shared.prompts.tests, 'run fixture tests');
  for (const input of [
    { version: 3 },
    { ...updated, profiles: [] },
    { ...updated, experimental: {} },
    { ...updated, experimental: { herdrApp: false, other: true } },
    { ...updated, profiles: { ...updated.profiles, alien: {} } },
  ])
    assert.throws(() => codec.store(input));
  assert.equal(experimentalScope(undefined, true), null);
  assert.equal(experimentalScope({}, false), null);
});
test('experimental preview detaches a reused Rex context and grants no input authority', async () => {
  const { harness } = require('../helpers/plugin-harness');
  const h = harness({ experimentalHerdrApp: true });
  await h.appear('rex');
  await h.ready();
  assert(h.api.keys.has('rex:0,0'));
  const count = h.calls.length;
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'willAppear',
      context: 'rex:0,0',
      payload: {
        settings: { profileScope: 'herdr-app' },
        coordinates: { row: 0, column: 0 },
      },
    }),
  );
  assert(!h.api.keys.has('rex:0,0'));
  h.socket.emit(
    'message',
    JSON.stringify({ event: 'keyDown', context: 'rex:0,0' }),
  );
  await h.api.settled();
  assert.equal(h.calls.length, count);
  const image = h.socket.frames
    .filter(
      (frame) => frame.event === 'setImage' && frame.context === 'rex:0,0',
    )
    .at(-1).payload.image;
  assert(
    Buffer.from(image.split(',')[1], 'base64')
      .toString()
      .includes('Preview only'),
  );
});
