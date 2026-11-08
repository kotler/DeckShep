const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCalibration } = require('../live/app-calibration/harness.cjs');
const {
  appEnvironment,
  OwnedEndpoints,
} = require('../live/app-calibration/isolation.cjs');
const { stageArtifacts } = require('../live/app-calibration/artifacts.cjs');
const { CalibrationChannel } = require('../live/app-calibration/channel.cjs');
const {
  calibrationArtifacts,
  calibrationFixture,
} = require('../helpers/app-calibration');
const { APP_FOCUS_RECORDS } = require('../../src/terminals/herdr-app/peer');
const { backendCapabilities } = require('../../src/domain/capabilities');

test('full calibration lifecycle uses real guarded sender on synthetic owned sockets and reports no verified focus', async (t) => {
  const fixture = calibrationFixture(t),
    beforeMask = process.umask(),
    report = await runCalibration(fixture.runOptions, fixture.effects);
  assert.equal(report.outcome, 'passed', JSON.stringify(report));
  assert.equal(report.cleanup, true);
  assert.equal(report.settingsUnchanged, true);
  assert.equal(report.productionApproved, false);
  assert.equal(report.verifiedFocus, false);
  assert.equal(report.scenarios.panes, 2);
  assert.equal(report.scenarios.requests.length, 2);
  assert(
    report.scenarios.requests.every(
      (request) => request.acknowledged && request.modelSelectedTarget,
    ),
  );
  assert.equal(
    fixture.calls.filter((call) => call.request.do === 'pane.focus').length,
    2,
  );
  assert.equal(
    fixture.calls.filter((call) => call.request.do === 'space.new').length,
    2,
  );
  assert.deepEqual(
    fixture.launches.map((launch) => [launch.kind, launch.args]),
    [
      ['core', ['serve']],
      ['app', []],
    ],
  );
  assert.equal(fixture.launches[0].env.HC_LAUNCHD_DIRECT, String(process.pid));
  assert.equal(fixture.launches[1].env.HC_LAUNCHD_DIRECT, undefined);
  assert.equal(process.umask(), beforeMask);
  assert.equal(fs.existsSync(fixture.launches[0].cwd), false);
  for (const privateText of [
    fixture.artifacts.directory,
    fixture.launches[0].cwd,
    'sample-core',
  ])
    assert(!JSON.stringify(report).includes(privateText));
  assert.deepEqual(APP_FOCUS_RECORDS, []);
  assert.deepEqual(backendCapabilities['herdr-app'], []);
});

test('acknowledgement with unchanged App selection remains request-only evidence', async (t) => {
  const fixture = calibrationFixture(t, { ackOnly: true }),
    report = await runCalibration(fixture.runOptions, fixture.effects);
  assert.equal(report.outcome, 'passed', JSON.stringify(report));
  assert.equal(report.scenarios.requests[0].modelSelectedTarget, false);
  assert.equal(report.scenarios.verifiedFocus, false);
});

test('unowned App/core peers receive no request bytes and every failure cleans up with settings checks', async (t) => {
  for (const kind of ['core', 'app']) {
    const fixture = calibrationFixture(t, {
        onProbe: (context) => {
          if (context.kind === kind) context.evidence.pid = 999;
        },
      }),
      report = await runCalibration(fixture.runOptions, fixture.effects);
    assert.equal(report.outcome, 'failed');
    assert(report.failures.includes(kind + '-ownership'));
    assert.equal(fixture.calls.filter((call) => call.kind === kind).length, 0);
    assert.equal(report.cleanup, true);
    assert.equal(report.settingsUnchanged, true);
    assert.equal(fixture.shutdowns(), 1);
  }
});

test('peer start, signature, executable and UID changes are refused before further setup or focus', async (t) => {
  for (const field of ['startMicros', 'cdHash', 'executable', 'uid']) {
    let appProbes = 0;
    const fixture = calibrationFixture(t, {
        onProbe: (context) => {
          if (context.kind === 'app' && ++appProbes > 1)
            context.evidence[field] =
              typeof context.evidence[field] === 'number' ? 999 : 'changed';
        },
      }),
      report = await runCalibration(fixture.runOptions, fixture.effects);
    assert.equal(report.outcome, 'failed');
    assert.equal(fixture.calls.filter((call) => call.request.do).length, 0);
    assert.equal(report.cleanup, true);
  }
});

test('changed global settings and failed cleanup cannot produce successful evidence', async (t) => {
  for (const options of [{ settingsChanged: true }, { cleanupFails: true }]) {
    const fixture = calibrationFixture(t, options),
      report = await runCalibration(fixture.runOptions, fixture.effects);
    assert.equal(report.outcome, 'failed');
    assert(
      report.failures.includes(
        options.cleanupFails ? 'cleanup' : 'global-settings',
      ),
    );
    if (options.cleanupFails)
      assert.equal(fs.existsSync(fixture.launches[0].cwd), true);
  }
});

test('calibration channel rejects arbitrary actions, input, remote setup and out-of-scope core reads before path access', async () => {
  const channel = new CalibrationChannel({
    root: '/private/tmp/fixture',
    check() {
      throw Error('Touched endpoint');
    },
  });
  for (const request of [
    { do: 'pane.zoom', args: { pane: 'p1' } },
    { do: 'terminal.open', args: { argv: ['codex'] } },
    {
      do: 'space.new',
      args: {
        name: 'Calibration 1',
        folder: '/private/tmp/fixture',
        machine: 'remote',
        argv: ['/bin/cat'],
      },
    },
    {
      do: 'space.new',
      args: {
        name: 'Calibration 1',
        folder: '/private/tmp/fixture',
        machine: '',
        argv: ['claude'],
      },
    },
  ])
    await assert.rejects(
      channel.exchange('app', [request], ['herdrAppFocusReply']),
      (error) => !error.message.includes('Touched endpoint'),
    );
  await assert.rejects(
    channel.exchange('core', [{ method: 'terminal.input' }], []),
    /Unsupported/,
  );
});

test('socket replacement, unsafe mode and changed helper abort before an App request', async (t) => {
  for (const change of ['replace', 'mode', 'helper']) {
    const fixture = calibrationFixture(t, {
        onProbe: ({ kind, launches }) => {
          if (kind !== 'app') return;
          const app = launches.find((launch) => launch.kind === 'app'),
            file = path.join(app.env.HERDR_APP_HOME, 'herdr-app.sock');
          if (change === 'replace') {
            fs.renameSync(file, file + '.previous');
            fs.writeFileSync(file, 'not a socket');
          } else if (change === 'mode') fs.chmodSync(file, 0o777);
          else
            fs.appendFileSync(
              path.join(path.dirname(app.file), '../../../herdr-app-peer'),
              'changed',
            );
        },
      }),
      report = await runCalibration(fixture.runOptions, fixture.effects);
    assert.equal(report.outcome, 'failed');
    assert.equal(fixture.calls.filter((call) => call.kind === 'app').length, 0);
    assert.equal(report.cleanup, true);
  }
});

test('bad core PID/schema, missing commands and private App errors cannot become calibration evidence', async (t) => {
  for (const fault of [
    'core-pid',
    'core-schema',
    'commands',
    'app-error',
    'app-overlay',
  ]) {
    const fixture = calibrationFixture(t, {
        respond: ({ kind, request, socket, commands, status }) => {
          let response;
          if (fault === 'core-pid' && request.method === 'server.status')
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ...require('../fixtures/backends/herdr-app/core-status.json'),
                pid: 999,
              },
            };
          if (fault === 'core-schema' && request.method === 'hello')
            response = { jsonrpc: '2.0', id: request.id, result: {} };
          if (fault === 'commands' && request.commands)
            response = commands.filter(
              (command) => command.name !== 'pane.focus',
            );
          if (fault === 'app-error' && kind === 'app')
            response = {
              error: '/private/owner/path secret-token prompt text',
            };
          if (fault === 'app-overlay' && request.status)
            response = { ...status, overlays: ['private-dialog'] };
          if (!response) return false;
          socket.write(JSON.stringify(response) + '\n');
          return true;
        },
      }),
      report = await runCalibration(fixture.runOptions, fixture.effects);
    assert.equal(report.outcome, 'failed');
    assert.equal(report.cleanup, true);
    assert.equal(report.settingsUnchanged, true);
    assert.equal(fixture.calls.filter((call) => call.request.do).length, 0);
    assert(!JSON.stringify(report).includes('secret-token'));
    assert(!JSON.stringify(report).includes('/private/owner'));
  }
});

test('cancellation enters cleanup, restores umask and removes temporary signal handlers', async (t) => {
  const controller = new AbortController(),
    beforeMask = process.umask(),
    beforeSignals = ['SIGINT', 'SIGTERM'].map((signal) =>
      process.listenerCount(signal),
    ),
    fixture = calibrationFixture(t, {
      onProbe: ({ kind }) => {
        if (kind === 'app') controller.abort();
      },
    });
  fixture.effects.signal = controller.signal;
  const report = await runCalibration(fixture.runOptions, fixture.effects);
  assert.equal(report.outcome, 'failed');
  assert.equal(report.cleanup, true);
  assert.equal(report.settingsUnchanged, true);
  assert.equal(fixture.calls.filter((call) => call.kind === 'app').length, 0);
  assert.equal(process.umask(), beforeMask);
  assert.deepEqual(
    ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)),
    beforeSignals,
  );
});

test('bounded setup timeout makes no retry and never logs the partial response', async (t) => {
  const fixture = calibrationFixture(t, {
      respond: ({ kind, socket }) => {
        if (kind !== 'app') return false;
        socket.write('{"private":"secret-token');
        return true;
      },
    }),
    started = performance.now(),
    report = await runCalibration(fixture.runOptions, fixture.effects);
  assert.equal(report.outcome, 'failed');
  assert(report.failures.includes('app-ownership'));
  assert.equal(fixture.calls.filter((call) => call.kind === 'app').length, 1);
  assert.equal(report.cleanup, true);
  assert(performance.now() - started < 6000);
  assert(!JSON.stringify(report).includes('secret-token'));
});

test('an unproven launch keeps its private directory and cannot claim successful cleanup', async (t) => {
  const fixture = calibrationFixture(t, {
      onSpawn() {
        throw Error('unknown child startup state');
      },
    }),
    report = await runCalibration(fixture.runOptions, fixture.effects);
  assert.equal(report.outcome, 'failed');
  assert.deepEqual(report.failures, ['core-launch', 'cleanup']);
  assert.equal(report.cleanup, false);
  assert.equal(fs.existsSync(fixture.launches[0].cwd), true);
});

test('out-of-root endpoints and overlong holder paths are refused before connecting', async (t) => {
  const fixture = calibrationArtifacts(t),
    staged = await stageArtifacts(
      fixture.directory,
      path.join(fixture.directory, 'staged'),
      fixture.decoder,
    ),
    env = appEnvironment(fixture.directory, staged.core),
    gate = new OwnedEndpoints(
      fixture.directory,
      { ...env, HC_SOCKET: '/outside/c.sock' },
      staged,
      { assert() {} },
      () => {
        throw Error('Probe must not run');
      },
      { core: { pid: 111 } },
    );
  assert.throws(() => gate.check('core'), /Non-owned/);
  const longRoot = path.join(fixture.directory, 'x'.repeat(80));
  fs.mkdirSync(longRoot, { mode: 0o700 });
  assert.throws(() => appEnvironment(longRoot, staged.core), /path too long/);
});

test('a preexisting App endpoint prevents App launch and raise handoff', async (t) => {
  const fixture = calibrationFixture(t, {
      onSpawn: ({ kind, env }) => {
        if (kind === 'core')
          fs.writeFileSync(
            path.join(env.HERDR_APP_HOME, 'herdr-app.sock'),
            'occupied',
          );
      },
    }),
    report = await runCalibration(fixture.runOptions, fixture.effects);
  assert.equal(report.outcome, 'failed');
  assert.deepEqual(
    fixture.launches.map((launch) => launch.kind),
    ['core'],
  );
  assert.equal(fixture.calls.filter((call) => call.kind === 'app').length, 0);
  assert.equal(report.cleanup, true);
});

test('a dispatched focus timeout stays uncertain and never retries or compensates', async (t) => {
  const fixture = calibrationFixture(t, {
      respond: ({ request }) => request.do === 'pane.focus',
    }),
    report = await runCalibration(fixture.runOptions, fixture.effects);
  assert.equal(report.outcome, 'failed');
  assert(report.failures.includes('scenarios'));
  assert.equal(
    fixture.calls.filter((call) => call.request.do === 'pane.focus').length,
    1,
  );
  assert.equal(report.scenarios.requests.at(-1).status, 'uncertain');
  assert.equal(report.cleanup, true);
  assert.equal(report.verifiedFocus, false);
});

test('unexpected parent exit cannot claim descendant cleanup or delete the private root', async (t) => {
  const fixture = calibrationFixture(t, {
      onProbe: ({ kind, launches }) => {
        if (kind === 'app')
          launches.find((launch) => launch.kind === 'core').child.exitCode = 1;
      },
    }),
    report = await runCalibration(fixture.runOptions, fixture.effects);
  assert.equal(report.outcome, 'failed');
  assert.equal(report.cleanup, false);
  assert(report.failures.includes('cleanup'));
  assert.equal(fixture.calls.filter((call) => call.kind === 'app').length, 0);
  assert.equal(fs.existsSync(fixture.launches[0].cwd), true);
  assert.equal(report.settingsUnchanged, true);
});
