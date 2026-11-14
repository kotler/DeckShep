const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const {
  reviewReleasePreview,
} = require('../live/app-calibration/release-approval.cjs');
const candidate = require('../../docs/validation/2026-11-08-herdr-app-installed-release-artifacts.json');
const calibration = require('../../docs/validation/2026-11-08-herdr-app-release-calibration.json');

test('private release preview needs explicit owner approval, exact candidate bytes and complete clean native evidence', () => {
  const record = reviewReleasePreview(candidate, calibration, true);
  assert.equal(record.executableSha256, candidate.app.executableSha256);
  assert.throws(() => reviewReleasePreview(candidate, calibration, false));
  for (const change of [
    (r) => (r.outcome = 'failed'),
    (r) => (r.cleanup = false),
    (r) => (r.settingsUnchanged = false),
    (r) => (r.productionApproved = true),
    (r) => (r.verifiedFocus = true),
    (r) => r.failures.push('cleanup'),
    (r) => (r.buildMode = 'source-no-updater'),
    (r) => (r.containment = {}),
    (r) => (r.containment.otherNetworkDenied = false),
    (r) => (r.releaseScenarios.unknownBuildRefused = false),
    (r) => (r.releaseScenarios.freshPostRestartRequestAcknowledged = false),
    (r) => (r.scenarios.requests[0].acknowledged = false),
    (r) => (r.releaseFeed.refused = 1),
    (r) => (r.releaseFeed.requests = 0),
    (r) => (r.limits.deliveryMs = 2000),
    (r) => (r.scenarios.requests[0].elapsedMs = 1000),
    (r) => (r.scenarios.core.version = '0.1.18'),
    (r) => (r.builds.app.plistSha256 = 'e'.repeat(64)),
    (r) => (r.builds.core.cdHash = 'a'.repeat(40)),
    (r) => (r.builds.helperSha256 = 'e'.repeat(64)),
  ]) {
    const report = structuredClone(calibration);
    change(report);
    assert.throws(() => reviewReleasePreview(candidate, report, true));
  }
});
test('private preview has no calendar cutoff and retains publisher, helper and native session checks', async () => {
  const source = path.resolve(
    'tests/live/app-calibration/release-preview-backend.cjs',
  );
  const localRequire = createRequire(source),
    module = { exports: {} };
  let now = 1000,
    disposed = 0;
  const evidence = { value: 'synthetic-peer' };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    module,
    process,
    Date: { now: () => now },
    Number,
    require(name) {
      if (name.endsWith('/app-peer-session'))
        return {
          nativeAppPeerSession: (helper, hash) => {
            assert(helper.endsWith('bin/herdr-app-peer'));
            assert.equal(hash, candidate.helper.sha256);
            return async () => ({
              captured: evidence,
              check: async () => evidence,
              finish: async () => evidence,
              dispose: async () => disposed++,
            });
          },
        };
      if (name.endsWith('/app-peer'))
        return { nativeAppPeerProbe: () => () => {} };
      if (name.endsWith('/paths'))
        return { pluginDirectory: '/synthetic/plugin' };
      if (name.endsWith('/herdr-app-backend'))
        return { appPeerHelperAvailable: () => true };
      if (name.endsWith('/peer'))
        return {
          AppPeerVerifier: class {
            constructor(_probe, records, _decoder, sessions, verifyPublisher) {
              this.verifyPublisher = verifyPublisher;
              this.records = records;
              this.sessions = sessions;
            }
          },
        };
      if (name.endsWith('/focus-sender'))
        return {
          GuardedAppFocusSender: class {
            constructor(verifier, authority, options) {
              Object.assign(this, { verifier, authority, options });
            }
          },
        };
      return localRequire(name);
    },
  });
  const backend = module.exports.releasePreviewBackend(candidate.helper.sha256);
  assert.equal(backend.kind, 'fixture-app-hardware-test');
  assert.equal(backend.recordCount, 1);
  assert.throws(() => backend.create({ herdrApp: {} }, {}));
  const sender = backend.create({ herdrApp: { home: '/synthetic/app' } }, {});
  assert.equal(sender.verifier.records.length, 0);
  assert.equal(typeof sender.verifier.verifyPublisher, 'function');
  const session = await sender.verifier.sessions(
    {},
    new AbortController().signal,
  );
  assert.equal(await session.check(), evidence);
  now += 48 * 60 * 60 * 1000;
  assert.equal(await session.finish(), evidence);
  assert.doesNotThrow(() =>
    backend.create({ herdrApp: { home: '/synthetic/app' } }, {}),
  );
  assert.equal(backend.recordCount, 1);
  await session.dispose();
  assert.equal(disposed, 1);
});

test('publisher check binds the socket hash and signed bundle, rechecking updated builds', async () => {
  const {
    publisherCheck,
  } = require('../live/app-calibration/release-preview-backend.cjs');
  const file = '/Applications/Herdr.app/Contents/MacOS/Herdr';
  const calls = [];
  const verify = publisherCheck(async (command, args) => {
    calls.push([command, args]);
    if (args[3].includes('b'.repeat(40))) throw Error('Signature rejected');
  });
  const first = 'a'.repeat(40),
    next = 'c'.repeat(40);
  await verify(file, first, 'exe', 'plist');
  assert.deepEqual(calls[0], [
    '/usr/bin/codesign',
    [
      '--verify',
      '--strict',
      '-R',
      '=anchor apple generic and identifier "dev.herdr.app" and certificate leaf[subject.OU] = "2W9652Q7QR" and cdhash H"' +
        first +
        '"',
      '/Applications/Herdr.app',
    ],
  ]);
  await verify(file, first, 'exe', 'plist');
  assert.equal(calls.length, 1);
  await assert.rejects(verify(file, 'b'.repeat(40), 'new', 'plist'));
  await verify(file, next, 'new', 'new-plist');
  assert.equal(calls.length, 3);
  await assert.rejects(verify(file, 'invalid', 'new', 'new-plist'));
});

test('publisher policy accepts a later release only with a verified retained peer', async (t) => {
  const { fixtureBuild } = require('../helpers/herdr-app-focus');
  const { AppPeerVerifier } = require('../../src/terminals/herdr-app/peer');
  const f = fixtureBuild(t);
  fs.writeFileSync(
    f.plist,
    JSON.stringify({
      ...f.metadata,
      CFBundleShortVersionString: '0.1.15',
      CFBundleVersion: '0.1.15',
    }),
  );
  const captured = f.evidence;
  let published = true;
  const sessions = async () => ({
    captured,
    check: async () => captured,
    finish: async () => captured,
    dispose: async () => {},
  });
  const verify = async (file, cdHash) => {
    assert.equal(file, f.executable);
    assert.equal(cdHash, captured.cdHash);
    if (!published) throw Error('Invalid signature');
  };
  const verifier = new AppPeerVerifier(
    async () => captured,
    [],
    f.decoder,
    sessions,
    verify,
  );
  const peer = await verifier.open({}, 'fixture-endpoint');
  assert.equal(peer.binding.recordKey, 'herdr-signed-' + captured.cdHash);
  await peer.finish();
  await peer.dispose();
  published = false;
  await assert.rejects(
    verifier.open({}, 'fixture-endpoint'),
    /Peer unverified/,
  );
  assert.throws(() =>
    new AppPeerVerifier(
      async () => captured,
      [],
      f.decoder,
      undefined,
      verify,
    ).assertConfigured(),
  );
});
