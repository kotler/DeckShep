const { isDeepStrictEqual } = require('node:util');
const { validate } = require('../../../src/schemas');
/** Passing calibration permits a private request-only preview only when the
 * owner explicitly requests it. Never creates a production capability record. */
function reviewReleasePreview(candidate, calibration, ownerApproved) {
  const checks = calibration?.releaseScenarios;
  if (
    ownerApproved !== true ||
    candidate?.buildMode !== 'installed-release-candidate' ||
    candidate.candidateOnly !== true ||
    candidate.nativeExecution !== false ||
    candidate.sourceAndCopiesStable !== true ||
    candidate.productionApproved !== false ||
    calibration?.buildMode !== 'installed-release-contained' ||
    calibration.outcome !== 'passed' ||
    calibration.cleanup !== true ||
    calibration.settingsUnchanged !== true ||
    calibration.productionApproved !== false ||
    calibration.verifiedFocus !== false ||
    calibration.failures?.length !== 0 ||
    calibration.limits?.deliveryMs !== 1000 ||
    calibration.limits?.armingMs !== 350 ||
    !calibration.containment ||
    ![
      'insideWrite',
      'outsideWriteDenied',
      'outsideReadDenied',
      'feedConnect',
      'otherNetworkDenied',
      'childExecDenied',
      'launchServicesDenied',
    ].every((key) => calibration.containment[key] === true) ||
    !/^[a-f0-9]{64}$/.test(calibration.policySha256 || '') ||
    calibration.releaseFeed?.refused !== 0 ||
    calibration.releaseFeed.requests < 1 ||
    !checks ||
    ![
      'unknownBuildRefused',
      'reconnectStable',
      'minimizeAcknowledged',
      'minimizedRequestAcknowledged',
      'preRestartPressRefused',
      'preRestartBindingRefused',
      'freshPostRestartRequestAcknowledged',
    ].every((key) => checks[key] === true) ||
    checks.restartRestoredPanes !== 2 ||
    checks.verifiedFocus !== false ||
    calibration.scenarios?.requests?.length !== 2 ||
    !calibration.scenarios.requests.every(
      (r) =>
        r.acknowledged === true &&
        r.status === 'requested' &&
        r.modelSelectedTarget === true &&
        Number.isFinite(r.elapsedMs) &&
        r.elapsedMs > 0 &&
        r.elapsedMs < 1000,
    )
  )
    throw Error('Release preview evidence required');
  const record = validate('herdrAppFocusRecord', {
    key: 'herdr-app-release-0.1.14-request-only',
    contract: 1,
    bundleId: candidate.app.bundleId,
    executable: 'Herdr',
    version: candidate.app.version,
    build: candidate.app.build,
    executableSha256: candidate.app.executableSha256,
    plistSha256: candidate.app.plistSha256,
    cdHash: candidate.app.signature.cdHash,
  });
  const withoutKey = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'key'),
  );
  if (
    !isDeepStrictEqual(withoutKey, calibration.builds.app) ||
    candidate.app.treeSha256 !== calibration.builds.appTreeSha256 ||
    candidate.core.executableSha256 !== calibration.builds.core.sha256 ||
    candidate.core.version !== calibration.builds.core.version ||
    candidate.core.version !== calibration.scenarios.core.version ||
    candidate.core.signature.cdHash !== calibration.builds.core.cdHash ||
    candidate.helper.sha256 !== calibration.builds.helperSha256
  )
    throw Error('Release preview builds changed');
  return record;
}
module.exports = { reviewReleasePreview };
