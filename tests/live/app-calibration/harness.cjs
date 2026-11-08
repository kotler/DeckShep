const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { OwnedProcesses, settingsHashes } = require('../safety.cjs');
const { nativeAppPeerProbe } = require('../../../src/platform/app-peer');
const { stageArtifacts } = require('./artifacts.cjs');
const {
  appAuthorization,
  appEnvironment,
  OwnedEndpoints,
} = require('./isolation.cjs');
const { CalibrationChannel } = require('./channel.cjs');
const { calibrate, waitFor } = require('./scenarios.cjs');

function createRun(effects) {
  const interrupted = new AbortController();
  return {
    effects,
    phase: 'artifacts',
    interrupted,
    abort: () => interrupted.abort(),
    owned: effects.owned ?? new OwnedProcesses(),
    fingerprint: effects.settingsHashes ?? (() => settingsHashes(os.homedir())),
    signal: AbortSignal.any([
      interrupted.signal,
      ...(effects.signal ? [effects.signal] : []),
    ]),
    report: {
      schema: 1,
      outcome: 'failed',
      productionApproved: false,
      verifiedFocus: false,
      buildMode: 'source-no-updater',
      failures: [],
      cleanup: false,
      settingsUnchanged: false,
      limits: {
        armingMs: 350,
        deliveryMs: 1000,
        setupExchangeMs: 3000,
        readinessMs: 10000,
      },
    },
  };
}
async function prepare(run, artifactDirectory) {
  if (!artifactDirectory) throw Error('Calibration artifacts required');
  run.root = fs.realpathSync(
    fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'dsh-cal-')),
  );
  fs.chmodSync(run.root, 0o700);
  run.artifacts = await stageArtifacts(
    artifactDirectory,
    path.join(run.root, 'bin'),
    run.effects.decoder,
  );
  const artifacts = run.artifacts,
    manifest = artifacts.manifest;
  run.env = appEnvironment(run.root, artifacts.core);
  run.children = {};
  run.gate = new OwnedEndpoints(
    run.root,
    run.env,
    artifacts,
    run.owned,
    run.effects.probe ?? nativeAppPeerProbe(artifacts.helper),
    run.children,
    run.signal,
  );
  run.report.builds = {
    appSource: manifest.appSource,
    coreSource: manifest.coreSource,
    app: Object.fromEntries(
      Object.entries(manifest.appRecord).filter(([key]) => key !== 'key'),
    ),
    appTreeSha256: manifest.appTreeSha256,
    core: manifest.core,
    helperSha256: manifest.helperSha256,
  };
  run.before = run.fingerprint();
  run.previousMask = process.umask(0o077);
}
function launch(run, file, args, options) {
  run.signal.throwIfAborted();
  run.artifacts.assertUnchanged();
  run.launchAttempted = true;
  try {
    return run.owned.spawn(file, args, options);
  } catch {
    run.unprovenLaunch = true;
    throw Error('Calibration launch failed');
  }
}
async function awaitSocket(gate, kind) {
  await waitFor(() => {
    gate.signal?.throwIfAborted();
    gate.assertChildren();
    // Missing is the only retryable readiness state. Unsafe/replaced paths abort.
    try {
      fs.lstatSync(gate.files[kind]);
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
    gate.check(kind);
    return true;
  });
}
async function exercise(run) {
  const { artifacts, children, gate, root, env, report, effects } = run;
  run.phase = 'core-launch';
  children.core = launch(run, artifacts.core, ['serve'], {
    cwd: root,
    env: { ...env, HC_LAUNCHD_DIRECT: String(process.pid) },
  });
  run.phase = 'core-ownership';
  await awaitSocket(gate, 'core');
  await new CalibrationChannel(gate).coreStatus();
  gate.captureDescendants();
  // Never let App startup raise an existing instance, even inside the new home.
  if (fs.existsSync(gate.files.app))
    throw Error('Calibration App home occupied');
  run.phase = 'app-launch';
  children.app = launch(run, artifacts.app, [], { cwd: root, env });
  run.phase = 'app-ownership';
  await awaitSocket(gate, 'app');
  // Both paths and the App peer are checked before the first App request.
  await new CalibrationChannel(gate).appRead(
    { status: true },
    'herdrAppStatus',
  );
  gate.captureDescendants();
  run.phase = 'scenarios';
  report.scenarios = { requests: [] };
  report.scenarios = await calibrate(gate, {
    ...effects,
    recordRequest: (request) => report.scenarios.requests.push(request),
  });
  report.outcome = 'passed';
}
async function cleanup(run) {
  const { report } = run;
  try {
    if (run.launchAttempted && !run.unprovenLaunch) {
      try {
        run.gate.captureDescendants();
      } catch {
        run.gate.ownershipLost = true;
      }
    }
    if (run.launchAttempted) await run.owned.shutdown();
    report.cleanup = !run.unprovenLaunch && !run.gate?.ownershipLost;
    if (!report.cleanup) report.failures.push('cleanup');
  } catch {
    report.failures.push('cleanup');
  }
  try {
    report.settingsUnchanged =
      run.before !== undefined &&
      isDeepStrictEqual(run.before, run.fingerprint());
    if (run.before !== undefined && !report.settingsUnchanged)
      report.failures.push('global-settings');
  } catch {
    report.failures.push('global-settings');
  }
  if (run.previousMask !== undefined) process.umask(run.previousMask);
  process.removeListener('SIGINT', run.abort);
  process.removeListener('SIGTERM', run.abort);
  // Retain the private directory if shutdown cannot prove every owned process
  // exited. Deleting sockets first would hide a surviving instance.
  if (run.root && report.cleanup) {
    try {
      fs.rmSync(run.root, { recursive: true, force: true });
    } catch {
      report.failures.push('temporary-files');
    }
  }
  if (report.failures.length) report.outcome = 'failed';
}
/** Injectable effects let fixtures test the full lifecycle without launching an
 * App, inspecting a live process, reading real HOME or connecting to real sockets. */
async function runCalibration(
  { artifactDirectory, env = process.env } = {},
  effects = {},
) {
  const reason = appAuthorization(env);
  if (reason)
    return {
      schema: 1,
      outcome: 'disabled',
      reason,
      productionApproved: false,
    };
  if ((effects.platform ?? process.platform) !== 'darwin')
    return {
      schema: 1,
      outcome: 'disabled',
      reason: 'App calibration requires macOS',
      productionApproved: false,
    };
  const run = createRun(effects);
  process.once('SIGINT', run.abort);
  process.once('SIGTERM', run.abort);
  try {
    await prepare(run, artifactDirectory);
    await exercise(run);
  } catch {
    // Native/process/fs messages can contain paths or terminal output. Retain
    // only this fixed phase identifier, never the caught exception or payloads.
    run.report.failures.push(run.phase);
  } finally {
    await cleanup(run);
  }
  return run.report;
}
module.exports = { runCalibration };
