const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixtureBuild } = require('../helpers/herdr-app-focus');
const {
  prepareReleaseCandidate,
} = require('../live/app-calibration/release-artifacts.cjs');
const { stageArtifacts } = require('../live/app-calibration/artifacts.cjs');
const { APP_FOCUS_RECORDS } = require('../../src/terminals/herdr-app/peer');
const { backendCapabilities } = require('../../src/domain/capabilities');
function fixture(t) {
  const build = fixtureBuild(t),
    app = path.join(build.root, 'Sample.app'),
    core = path.join(build.root, 'Herdr Core.app');
  fs.chmodSync(build.executable, 0o755);
  fs.mkdirSync(path.join(core, 'Contents/MacOS'), {
    recursive: true,
    mode: 0o700,
  });
  fs.writeFileSync(
    path.join(core, 'Contents/MacOS/herdr-core'),
    'Synthetic core, never executed',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(core, 'Contents/Info.plist'),
    JSON.stringify({
      CFBundleIdentifier: 'dev.herdr.core',
      CFBundleExecutable: 'herdr-core',
      CFBundleVersion: '0.1.19',
      CFBundleShortVersionString: '0.1.19',
    }),
    { mode: 0o600 },
  );
  const helper = path.join(build.root, 'herdr-app-peer');
  fs.writeFileSync(helper, 'Synthetic helper, never executed', { mode: 0o755 });
  const calls = [];
  return {
    build,
    core,
    helper,
    calls,
    options: {
      appBundle: app,
      coreBundle: core,
      helper,
      destination: path.join(build.root, 'candidate'),
    },
    effects: {
      decodePlist: (bytes) => JSON.parse(bytes),
      verifySignature: async (bundle, identifier) => {
        calls.push({ bundle, identifier });
        return {
          valid: true,
          cdHash: 'a'.repeat(40),
          teamIdentifier: '2W9652Q7QR',
          publisherRequirementVerified: true,
        };
      },
    },
  };
}
test('release staging preserves exact bundles and executable modes without producing a runnable or approval manifest', async (t) => {
  const f = fixture(t),
    report = await prepareReleaseCandidate(f.options, f.effects);
  assert.equal(report.buildMode, 'installed-release-candidate');
  for (const name of [
    'nativeExecution',
    'approvedForLiveRun',
    'productionApproved',
    'verifiedFocus',
    'runningPairEstablished',
  ])
    assert.equal(report[name], false);
  assert.equal(report.core.version, '0.1.19');
  assert.equal(report.app.version, '0.1.14');
  assert.equal(f.calls.length, 4);
  assert(!fs.existsSync(path.join(f.options.destination, 'manifest.json')));
  assert.equal(
    fs.statSync(
      path.join(f.options.destination, 'Herdr.app/Contents/MacOS/Herdr'),
    ).mode & 0o777,
    0o755,
  );
  assert.deepEqual(
    fs.readFileSync(
      path.join(f.options.destination, 'Herdr.app/Contents/MacOS/Herdr'),
    ),
    fs.readFileSync(f.build.executable),
  );
  assert(!JSON.stringify(report).includes(f.build.root));
  await assert.rejects(
    stageArtifacts(
      f.options.destination,
      path.join(f.build.root, 'should-not-stage'),
      f.effects.decodePlist,
    ),
  );
  assert.deepEqual(APP_FOCUS_RECORDS, []);
  assert.deepEqual(backendCapabilities['herdr-app'], []);
});
test('failed or wrong-publisher signature checks refuse before writing candidate files', async (t) => {
  for (const value of [
    null,
    { valid: false },
    {
      valid: true,
      teamIdentifier: 'foreign',
      publisherRequirementVerified: true,
      cdHash: 'a'.repeat(40),
    },
    {
      valid: true,
      teamIdentifier: '2W9652Q7QR',
      publisherRequirementVerified: false,
      cdHash: 'a'.repeat(40),
    },
    {
      valid: true,
      teamIdentifier: '2W9652Q7QR',
      publisherRequirementVerified: true,
      cdHash: 'invalid',
    },
  ]) {
    const f = fixture(t);
    f.effects.verifySignature = async () => value;
    await assert.rejects(
      prepareReleaseCandidate(f.options, f.effects),
      (error) => error.message === 'Release staging refused',
    );
    assert(!fs.existsSync(f.options.destination));
  }
});
test('bundle links, hardlinks, shared writable files, bad identities and missing execute permissions refuse', async (t) => {
  for (const change of [
    (f) =>
      fs.symlinkSync(f.build.executable, path.join(f.core, 'Contents/link')),
    (f) => fs.linkSync(f.helper, path.join(f.core, 'Contents/hard')),
    (f) => fs.chmodSync(f.build.executable, 0o777),
    (f) => fs.chmodSync(f.helper, 0o644),
    (f) => fs.writeFileSync(f.build.plist, '{"CFBundleIdentifier":"foreign"}'),
    (f) => fs.writeFileSync(f.build.plist, 'private invalid metadata'),
  ]) {
    const f = fixture(t);
    change(f);
    await assert.rejects(
      prepareReleaseCandidate(f.options, f.effects),
      /Release staging refused/,
    );
    assert(!fs.existsSync(f.options.destination));
  }
});
test('changed originals and copied signing evidence fail closed and remove only test-owned partial copies', async (t) => {
  for (const mode of ['source', 'copy']) {
    const f = fixture(t);
    let count = 0;
    const verify = f.effects.verifySignature;
    f.effects.verifySignature = async (bundle, id) => {
      const value = await verify(bundle, id);
      count++;
      if (mode === 'source' && count === 1)
        fs.appendFileSync(f.build.executable, 'changed');
      if (mode === 'copy' && count === 3)
        return { ...value, cdHash: 'b'.repeat(40) };
      return value;
    };
    await assert.rejects(
      prepareReleaseCandidate(f.options, f.effects),
      /Release staging refused/,
    );
    assert(!fs.existsSync(f.options.destination));
    assert(fs.existsSync(f.build.executable));
    assert(fs.existsSync(f.helper));
  }
});
test('existing or nonprivate output locations are never overwritten', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.options.destination, { mode: 0o700 });
  fs.writeFileSync(path.join(f.options.destination, 'keep'), 'owned');
  await assert.rejects(
    prepareReleaseCandidate(f.options, f.effects),
    /Release staging refused/,
  );
  assert.equal(
    fs.readFileSync(path.join(f.options.destination, 'keep'), 'utf8'),
    'owned',
  );
  const next = fixture(t);
  fs.chmodSync(next.build.root, 0o755);
  await assert.rejects(
    prepareReleaseCandidate(next.options, next.effects),
    /Release staging refused/,
  );
  fs.chmodSync(next.build.root, 0o700);
});
test('release loader re-attests the exact candidate and retains whole signed core identity', async (t) => {
  const { stageRelease } = require('../live/app-calibration/release-stage.cjs');
  const f = fixture(t);
  await prepareReleaseCandidate(f.options, f.effects);
  const staged = await stageRelease(
    f.options.destination,
    path.join(f.build.root, 'run-copy'),
    f.effects,
  );
  assert(staged.core.endsWith('Herdr Core.app/Contents/MacOS/herdr-core'));
  assert.equal(staged.manifest.appRecord.contract, 1);
  assert.equal(staged.manifest.core.version, '0.1.19');
  staged.assertUnchanged();
  staged.verifyTrees();
  fs.appendFileSync(staged.core, 'changed');
  assert.throws(() => staged.assertUnchanged());
  assert.throws(() => staged.verifyTrees());
  const reportFile = path.join(f.options.destination, 'release-candidate.json');
  const report = JSON.parse(fs.readFileSync(reportFile));
  report.core.version = '0.1.18';
  fs.writeFileSync(reportFile, JSON.stringify(report));
  await assert.rejects(
    stageRelease(
      f.options.destination,
      path.join(f.build.root, 'bad-copy'),
      f.effects,
    ),
    /Release candidate changed/,
  );
});
