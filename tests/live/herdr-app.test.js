const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appAuthorization } = require('./app-calibration/isolation.cjs');
const { runCalibration } = require('./app-calibration/harness.cjs');

const reason = appAuthorization();
test(
  'live Herdr App: owned source-build isolation and request-only calibration',
  {
    skip: reason || false,
    timeout: 120000,
  },
  async (t) => {
    // These flags acknowledge an authorization obtained outside the runner; they
    // do not grant permission to an automated coding agent to run this test.
    const report = await runCalibration(
      {
        artifactDirectory: process.env.ASW_HERDR_APP_ARTIFACTS,
      },
      { signal: t.signal },
    );
    t.diagnostic(JSON.stringify(report));
    assert.equal(
      report.outcome,
      'passed',
      'App calibration did not pass; production remains disabled',
    );
    assert.equal(report.cleanup, true);
    assert.equal(report.settingsUnchanged, true);
    assert.equal(report.productionApproved, false);
  },
);
