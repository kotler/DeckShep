const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appAuthorization } = require('./app-calibration/isolation.cjs');
const {
  runReleaseCalibration,
} = require('./app-calibration/release-runner.cjs');
test(
  'live Herdr release: restricted owned calibration',
  {
    skip:
      appAuthorization() ||
      (process.env.ASW_LIVE_HERDR_APP_RELEASE !== '1' &&
        'Release calibration requires ASW_LIVE_HERDR_APP_RELEASE=1'),
    timeout: 120000,
  },
  async (t) => {
    const report = await runReleaseCalibration(
      { artifactDirectory: process.env.ASW_HERDR_APP_RELEASE_ARTIFACTS },
      { signal: t.signal },
    );
    t.diagnostic(JSON.stringify(report));
    assert.equal(report.outcome, 'passed');
    assert.equal(report.cleanup, true);
    assert.equal(report.settingsUnchanged, true);
    assert.equal(report.productionApproved, false);
  },
);
