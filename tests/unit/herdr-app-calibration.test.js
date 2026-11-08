const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCalibration } = require('../live/app-calibration/harness.cjs');
const {
  appAuthorization,
  appEnvironment,
} = require('../live/app-calibration/isolation.cjs');
const { stageArtifacts } = require('../live/app-calibration/artifacts.cjs');
const {
  authorized,
  calibrationArtifacts,
} = require('../helpers/app-calibration');

test('App calibration requires all three explicit opt-ins and never runs in CI', async () => {
  for (const env of [
    {},
    { ASW_LIVE: '1' },
    { ASW_LIVE: '1', ASW_LIVE_AUTHORIZATION: 'test-owned-only' },
    { ...authorized, CI: '1' },
  ]) {
    assert(appAuthorization(env));
    const effects = new Proxy(
      {},
      {
        get() {
          throw Error('Disabled runner touched effects');
        },
      },
    );
    const report = await runCalibration({ env }, effects);
    assert.equal(report.outcome, 'disabled');
    assert.equal(report.productionApproved, false);
  }
  assert.equal(appAuthorization(authorized), null);
  assert.equal(
    (await runCalibration({ env: authorized }, { platform: 'linux' })).outcome,
    'disabled',
  );
});

test('calibration stages pinned private artifacts and drops inherited routing/auth/update environments', async (t) => {
  const fixture = calibrationArtifacts(t),
    destination = path.join(fixture.directory, 'staged'),
    artifacts = await stageArtifacts(
      fixture.directory,
      destination,
      fixture.decoder,
    ),
    env = appEnvironment(fixture.directory, artifacts.core);
  assert.equal(env.HERDR_APP_HOME, path.join(fixture.directory, 'app'));
  assert(env.HC_SOCKET.startsWith(fixture.directory + '/'));
  assert.match(env.HC_SESSION, /^dsh-[a-f0-9]{12}$/);
  assert.equal(env.HC_LAUNCHD_DIRECT, undefined);
  for (const key of [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'HERDR_RELEASES_URL',
    'HERDR_APP_RELEASE',
    'HERDR_SOCKET_PATH_UNTRUSTED',
    'NODE_OPTIONS',
    'DYLD_INSERT_LIBRARIES',
    'HTTPS_PROXY',
  ])
    assert.equal(env[key], undefined);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(env.HERDR_APP_HOME, 'settings.json')))
      .core,
    artifacts.core,
  );
  artifacts.assertUnchanged();
  fs.appendFileSync(artifacts.core, 'changed');
  assert.throws(artifacts.assertUnchanged);
});

test('source manifest rejects release builds, wrong pins, changed hashes, links and shared artifacts before launch', async (t) => {
  const mutations = [
    (f) => {
      f.manifest.buildMode = 'release';
      f.save();
    },
    (f) => {
      f.manifest.coreSource = '0'.repeat(40);
      f.save();
    },
    (f) => {
      f.manifest.appRecord.build = 'private/path/secret';
      f.save();
    },
    (f) => {
      fs.appendFileSync(path.join(f.directory, 'herdr-core'), 'changed');
    },
    (f) => {
      fs.chmodSync(path.join(f.directory, 'herdr-app-peer'), 0o777);
    },
    (f) => {
      fs.linkSync(
        path.join(f.directory, 'herdr-core'),
        path.join(f.directory, 'extra-link'),
      );
    },
    (f) => {
      fs.symlinkSync(
        '/nonexistent',
        path.join(f.directory, 'Herdr.app', 'linked'),
      );
    },
  ];
  for (const mutate of mutations) {
    const fixture = calibrationArtifacts(t);
    mutate(fixture);
    await assert.rejects(
      stageArtifacts(
        fixture.directory,
        path.join(fixture.directory, 'staged'),
        fixture.decoder,
      ),
    );
  }
});
