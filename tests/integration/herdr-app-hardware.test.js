const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PassThrough } = require('node:stream');
const { fixtureBuild } = require('../helpers/herdr-app-focus');
const { calibrationFixture } = require('../helpers/app-calibration');
const { runCalibration } = require('../live/app-calibration/harness.cjs');
const {
  holdHardwareRun,
} = require('../live/app-calibration/hardware-runner.cjs');

test('hardware test backend binds the exact runner lease and rejects stale, changed or foreign peers', async (t) => {
  const build = fixtureBuild(t),
    root = build.root;
  const evidence = {
    ...build.evidence,
    executable: path.join(root, 'session/bin/Herdr.app/Contents/MacOS/Herdr'),
  };
  const lease = { schema: 1, nonce: 'owned-fixture', app: evidence },
    heartbeat = { nonce: lease.nonce, at: Date.now() };
  const write = (name, value) =>
    fs.writeFileSync(path.join(root, name), JSON.stringify(value), {
      mode: 0o600,
    });
  const source = path.resolve(
      'tests/live/app-calibration/hardware-backend.cjs',
    ),
    localRequire = createRequire(source),
    module = { exports: {} };
  let captures = 0,
    disposed = 0,
    foreign = false;
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    module,
    process,
    require(name) {
      if (name.endsWith('/app-peer-session'))
        return {
          nativeAppPeerSession: () => async () => {
            captures++;
            return {
              captured: foreign
                ? { ...evidence, pidVersion: evidence.pidVersion + 1 }
                : evidence,
              check: async () => evidence,
              finish: async () => evidence,
              dispose: async () => {
                disposed++;
              },
            };
          },
        };
      if (name.endsWith('/peer'))
        return {
          AppPeerVerifier: class {
            constructor(_probe, _records, _decoder, factory) {
              this.factory = factory;
            }
          },
        };
      if (name.endsWith('/focus-sender'))
        return {
          GuardedAppFocusSender: class {
            constructor(verifier, _authority, options) {
              Object.assign(this, { verifier, options });
            }
          },
        };
      if (name.endsWith('/herdr-app-backend'))
        return { appPeerHelperAvailable: () => true };
      if (name.endsWith('/paths')) return { pluginDirectory: root };
      return localRequire(name);
    },
  });
  const backend = module.exports.hardwareBackend(
    root,
    build.record,
    'a'.repeat(64),
  );
  assert.equal(backend.kind, 'fixture-app-hardware-test');
  assert.equal(backend.recordCount, 1);
  assert(backend.helperAvailable());
  assert.throws(
    () => backend.create({ herdrApp: { home: '/foreign' } }, {}),
    /unavailable/,
  );
  assert.throws(() =>
    backend.create({ herdrApp: { home: path.join(root, 'session/app') } }, {}),
  );
  write('lease.json', lease);
  write('heartbeat.json', heartbeat);
  const port = backend.create(
    { herdrApp: { home: path.join(root, 'session/app') } },
    {},
  );
  let session = await port.verifier.factory({});
  assert.deepEqual(await session.check(), evidence);
  assert.deepEqual(await session.finish(), evidence);
  await session.dispose();
  for (const update of [
    () => write('heartbeat.json', { ...heartbeat, at: Date.now() - 1000 }),
    () => write('heartbeat.json', { ...heartbeat, at: Date.now() + 10000 }),
    () => write('heartbeat.json', { ...heartbeat, nonce: 'foreign' }),
    () => write('lease.json', { ...lease, nonce: 'changed' }),
  ]) {
    write('lease.json', lease);
    write('heartbeat.json', { ...heartbeat, at: Date.now() });
    session = await port.verifier.factory({});
    update();
    await assert.rejects(session.check(), /unavailable/);
    await session.dispose();
  }
  write('lease.json', lease);
  write('heartbeat.json', { ...heartbeat, at: Date.now() });
  foreign = true;
  await assert.rejects(port.verifier.factory({}), /unverified/);
  assert.equal(captures, disposed);
  fs.chmodSync(path.join(root, 'lease.json'), 0o644);
  assert.throws(
    () =>
      backend.create(
        { herdrApp: { home: path.join(root, 'session/app') } },
        {},
      ),
    /unavailable/,
  );
});

test('hardware runner publishes only an owned heartbeat after calibration and removes it before cleanup', async (t) => {
  const fixture = calibrationFixture(t),
    input = new PassThrough();
  let observed = false;
  fixture.effects.hold = async (run) => {
    const holding = holdHardwareRun(run, fixture.artifacts.directory, {
      input,
      ready: () => {},
    });
    const lease = JSON.parse(
      fs.readFileSync(path.join(fixture.artifacts.directory, 'lease.json')),
    );
    assert.equal(lease.app.pid, JSON.parse(run.gate.peers.get('app')).pid);
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(fixture.artifacts.directory, 'heartbeat.json'),
        ),
      ).nonce,
      lease.nonce,
    );
    observed = true;
    input.write('\n');
    await holding;
    assert(
      !fs.existsSync(path.join(fixture.artifacts.directory, 'lease.json')),
    );
    assert(
      !fs.existsSync(path.join(fixture.artifacts.directory, 'heartbeat.json')),
    );
  };
  const report = await runCalibration(fixture.runOptions, fixture.effects);
  assert(observed);
  assert.equal(report.outcome, 'passed');
  assert(report.cleanup);
  assert(report.settingsUnchanged);
});
