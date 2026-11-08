const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  preferenceCodec,
  migrateV3,
  rollbackV2,
} = require('../../src/app/experimental-preferences');
const legacy = require('../../src/app/preferences');
const boundary = require('../../src/schemas');
const base = require('../../com.kotl3r.deckshep.sdPlugin/config.json');
const codec = preferenceCodec(true);
const disabled = {
  herdrAppReadbackEnabled: false,
  herdrAppInputEnabled: false,
  claudeEnabled: false,
};

test('every v1/v2 migration preserves legacy opt-ins and gives App no consent', () => {
  for (const input of [
    undefined,
    {},
    {
      version: 1,
      preferences: {
        allowClipboardFocus: true,
        herdrTitleIdentity: true,
        claudeEnabled: true,
      },
    },
    {
      version: 2,
      revision: 9,
      shared: { animationEnabled: false },
      profiles: {
        rex: { allowClipboardFocus: true, claudeEnabled: true },
        herdr: {
          herdrSocketPath: '/sample/tui.sock',
          herdrTitleIdentity: true,
          claudeEnabled: false,
        },
      },
    },
  ]) {
    const previous = legacy.store(input),
      next = migrateV3(input);
    assert.deepEqual(next.profiles['herdr-app'], disabled);
    assert.deepEqual(rollbackV2(next), previous);
    assert.equal(
      JSON.stringify(legacy.serialize(rollbackV2(next))),
      JSON.stringify(legacy.serialize(previous)),
    );
    assert.deepEqual(migrateV3(JSON.parse(JSON.stringify(next))), next);
  }
  assert.equal(preferenceCodec(false), legacy);
  assert.equal(
    preferenceCodec(false).scopeOf({ profileScope: 'herdr-app' }),
    null,
  );
  assert.equal(codec.scopeOf({ profileScope: 'herdr-app' }), 'herdr-app');
  assert.equal(codec.scopeOf({}), 'rex');
  assert.equal(codec.scopeOf({ profileScope: 'other' }), null);
});

test('App settings and shared edits round-trip without entering Rex or Herdr profiles', () => {
  const saved = codec.store({
    version: 1,
    preferences: {
      allowClipboardFocus: true,
      claudeEnabled: true,
      herdrTitleIdentity: true,
    },
  });
  const app = codec.update(saved, 'herdr-app', {
    backend: 'herdr-app',
    herdrAppHome: '/sample/app',
    herdrAppCoreSocketPath: '/sample/core.sock',
    herdrAppReadbackEnabled: true,
    herdrAppInputEnabled: true,
    claudeEnabled: false,
    animationEnabled: false,
    prompts: { review: 'sample review' },
  });
  assert.deepEqual(saved.profiles['herdr-app'], disabled);
  assert.deepEqual(app.profiles.rex, saved.profiles.rex);
  assert.deepEqual(app.profiles.herdr, saved.profiles.herdr);
  assert.equal(app.revision, saved.revision + 1);
  assert.equal(app.shared.prompts.review, 'sample review');
  assert.deepEqual(
    codec.serialize(app),
    codec.store(JSON.parse(JSON.stringify(app))),
  );
  boundary.validate('globalSettings', app);
  const rexEdit = codec.update(app, 'rex', { claudeEnabled: false });
  const tuiEdit = codec.update(rexEdit, 'herdr', { claudeEnabled: false });
  assert.deepEqual(tuiEdit.profiles['herdr-app'], app.profiles['herdr-app']);
  assert.equal(rollbackV2(tuiEdit).profiles.rex.claudeEnabled, false);
  assert.equal(rollbackV2(tuiEdit).profiles.herdr.claudeEnabled, false);
  assert(!JSON.stringify(rollbackV2(tuiEdit)).includes('herdrAppHome'));
});

test('App runtime projection overrides inherited native opt-ins and uses only App settings', () => {
  const saved = codec.store({
    version: 1,
    preferences: {
      allowClipboardFocus: true,
      claudeEnabled: true,
      herdrTitleIdentity: true,
    },
  });
  const config = codec.profileConfig(
    {
      ...base,
      allowClipboardFocus: true,
      claude: { enabled: true },
      herdrApp: {
        home: '/unrelated',
        coreSocketPath: '/unrelated.sock',
        readbackEnabled: true,
        inputEnabled: true,
      },
    },
    saved,
    'herdr-app',
  );
  assert.equal(config.backend, 'herdr-app');
  assert.equal(config.allowClipboardFocus, false);
  assert.equal(config.bringToFront, false);
  assert.equal(config.claude.enabled, false);
  assert.deepEqual(config.herdrApp, {
    home: '',
    coreSocketPath: '',
    readbackEnabled: false,
    inputEnabled: false,
  });
  const view = codec.view(config);
  assert.equal(view.herdrAppReadbackEnabled, false);
  assert.equal(view.herdrAppInputEnabled, false);
  assert.deepEqual(
    codec.profileConfig(base, saved, 'rex'),
    legacy.profileConfig(base, rollbackV2(saved), 'rex'),
  );
  assert.deepEqual(codec.view(base), legacy.view(base));
  assert.deepEqual(codec.normalize({ herdrAppReadbackEnabled: true }), {
    herdrAppReadbackEnabled: true,
  });
  assert.deepEqual(
    codec.normalize({ animationEnabled: false }),
    legacy.normalize({ animationEnabled: false }),
  );
});

test('corrupt, unknown, foreign-profile and malformed App preferences fail closed', () => {
  const saved = codec.store();
  for (const value of [
    null,
    [],
    { sendKeys: true },
    { herdrAppInputEnabled: 'true' },
    { herdrAppReadbackEnabled: 1 },
    { herdrAppHome: 'relative' },
    { herdrAppCoreSocketPath: '/sample\nprivate' },
  ])
    assert.throws(() =>
      codec.store({
        ...saved,
        profiles: { ...saved.profiles, 'herdr-app': value },
      }),
    );
  for (const patch of [
    { backend: 'rex' },
    { allowClipboardFocus: true },
    { herdrTitleIdentity: true },
    { herdrSocketPath: '/sample/tui.sock' },
    { herdrAppHome: '~/.config/herdr-app' },
    { prompts: { review: '   ' } },
  ])
    assert.throws(() => codec.update(saved, 'herdr-app', patch));
  assert.throws(() =>
    codec.update(saved, 'rex', { herdrAppInputEnabled: true }),
  );
  assert.throws(() =>
    codec.update(saved, 'herdr', { herdrAppReadbackEnabled: true }),
  );
  assert.throws(() => codec.update(saved, 'alien', {}));
  assert.throws(() => codec.store({ version: 4 }));
  assert.throws(() => codec.store({ ...saved, revision: -1 }));
  assert.throws(() =>
    codec.normalize({ herdrAppHome: '/sample', unknown: true }),
  );
  for (const profile of [null, [], { herdrAppInputEnabled: 1 }])
    assert.throws(() => boundary.validate('herdrAppProfile', profile));
});
