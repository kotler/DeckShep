const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { appAuthorization, appEnvironment } = require('./isolation.cjs');
const { runCalibration } = require('./harness.cjs');
const { stageRelease } = require('./release-stage.cjs');
const { releaseFeed, writePolicy } = require('./release-policy.cjs');
const { hash } = require('./artifacts.cjs');
const { releaseScenarios } = require('./release-scenarios.cjs');

async function blockedPort() {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
function containmentProbe(root, feed, blocked) {
  const executable = path.join(root, 'boundary-probe');
  execFileSync(
    '/usr/bin/clang',
    [
      '-O2',
      '-Wall',
      '-Werror',
      path.join(__dirname, 'release-probe.c'),
      '-o',
      executable,
    ],
    { stdio: 'pipe', timeout: 20000 },
  );
  const policy = writePolicy(root, [executable], feed.port);
  const outside = fs.mkdtempSync('/private/tmp/dsh-boundary-');
  fs.chmodSync(outside, 0o700);
  const secret = path.join(outside, 'read-sentinel');
  fs.writeFileSync(secret, 'Synthetic sentinel', { mode: 0o600 });
  try {
    const result = execFileSync(
      '/usr/bin/sandbox-exec',
      [
        '-f',
        policy,
        executable,
        path.join(root, 'state/inside'),
        path.join(outside, 'outside'),
        String(feed.port),
        String(blocked.port),
        secret,
      ],
      {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 5000,
        env: { PATH: '/usr/bin:/bin', HOME: path.join(root, 'state') },
      },
    );
    return JSON.parse(result);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
    fs.rmSync(policy);
    fs.rmSync(executable);
    fs.rmSync(path.join(root, 'state/inside'), { force: true });
  }
}
/** Owner-authorized release runs only. This cannot be reached by production
 * config or the source-only launcher. Policy is exercised before Herdr launch. */
async function runReleaseCalibration(
  { artifactDirectory, env = process.env } = {},
  effects = {},
) {
  const reason =
    appAuthorization(env) ||
    (env.ASW_LIVE_HERDR_APP_RELEASE !== '1'
      ? 'Release calibration requires ASW_LIVE_HERDR_APP_RELEASE=1'
      : null);
  if (reason) return { outcome: 'disabled', reason, productionApproved: false };
  const feed = await releaseFeed(),
    blocked = await blockedPort();
  let boundary, policy, policySha256, catShell, catShellSha256;
  try {
    const report = await runCalibration(
      { artifactDirectory, env },
      {
        ...effects,
        buildMode: 'installed-release-contained',
        stageArtifacts: (directory, destination) =>
          stageRelease(directory, destination),
        environment(root, core) {
          const state = path.join(root, 'state');
          fs.mkdirSync(state, { mode: 0o700 });
          const result = appEnvironment(state, core);
          result.HC_INSTALL_DIR = path.join(state, 'install');
          result.HERDR_RELEASES_URL = feed.url;
          boundary = containmentProbe(root, feed, blocked);
          catShell = path.join(root, 'cat-shell');
          execFileSync(
            '/usr/bin/clang',
            [
              '-O2',
              '-Wall',
              '-Werror',
              path.join(__dirname, 'release-cat-shell.c'),
              '-o',
              catShell,
            ],
            { stdio: 'pipe', timeout: 20000 },
          );
          catShellSha256 = hash(fs.readFileSync(catShell));
          result.SHELL = catShell;
          return result;
        },
        launch(run, file, args, options) {
          feed.assertClean();
          if (!policy) {
            policy = writePolicy(
              run.root,
              [
                run.artifacts.app,
                run.artifacts.core,
                catShell,
                '/bin/cat',
                '/usr/bin/curl',
              ],
              feed.port,
            );
            policySha256 = hash(fs.readFileSync(policy));
          }
          return run.owned.spawn(
            '/usr/bin/sandbox-exec',
            ['-f', policy, file, ...args],
            options,
          );
        },
        async afterScenarios(run) {
          run.phase = 'release-updater-observation';
          // Cross the documented initial ten-second updater tick with all mutation
          // and network restrictions still enforced. Never fetch/apply a payload.
          for (let index = 0; index < 24; index++) {
            run.signal.throwIfAborted();
            run.gate.checkBoth();
            feed.assertClean();
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          run.gate.captureDescendants();
          run.artifacts.verifyTrees();
          if (hash(fs.readFileSync(catShell)) !== catShellSha256)
            throw Error('Release shell changed');
          if (effects.afterScenarios) await effects.afterScenarios(run);
          await releaseScenarios(run);
          run.artifacts.verifyTrees();
          feed.assertClean();
        },
      },
    );
    if (feed.counts().refused) {
      report.outcome = 'failed';
      report.failures.push('release-feed');
    }
    return {
      ...report,
      containment: boundary || null,
      policySha256: policySha256 || null,
      catShellSha256: catShellSha256 || null,
      releaseFeed: feed.counts(),
    };
  } finally {
    await feed.close();
    await blocked.close();
  }
}
module.exports = { runReleaseCalibration, containmentProbe };
