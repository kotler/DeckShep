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
test('private preview has no calendar cutoff and retains exact record/helper and native session checks', async () => {
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
            constructor(_probe, records, _decoder, sessions) {
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
  const record = reviewReleasePreview(candidate, calibration, true);
  const backend = module.exports.releasePreviewBackend(
    record,
    candidate.helper.sha256,
  );
  assert.equal(backend.kind, 'fixture-app-hardware-test');
  assert.equal(backend.recordCount, 1);
  assert.throws(() => backend.create({ herdrApp: {} }, {}));
  const sender = backend.create({ herdrApp: { home: '/synthetic/app' } }, {});
  assert.equal(sender.verifier.records[0], record);
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
