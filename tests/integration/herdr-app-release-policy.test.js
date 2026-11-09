const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  releasePolicy,
  releaseFeed,
} = require('../live/app-calibration/release-policy.cjs');
const {
  runReleaseCalibration,
} = require('../live/app-calibration/release-runner.cjs');
test('release policy constrains writes, executables, sockets, network and relaunch services', (t) => {
  const root = fs.mkdtempSync('/private/tmp/dsh-policy-');
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const policy = releasePolicy(
    root,
    [root + '/Herdr', '/bin/cat', '/usr/bin/curl'],
    12345,
  );
  assert(policy.includes('(deny default)'));
  assert(policy.includes('(subpath "' + root + '/state")'));
  assert(policy.includes('(remote tcp "localhost:12345")'));
  assert(!policy.includes('(allow default)'));
  assert(policy.includes('(deny lsopen appleevent-send)'));
  assert(!policy.includes('appleevents'));
  assert(!policy.includes('/bin/sh'));
  assert(!policy.includes('/usr/bin/open'));
  assert.throws(() => releasePolicy(root, ['/Applications/Herdr.app'], 12345));
  assert.throws(() => releasePolicy(root, [root + '/bad"path'], 12345));
  assert.throws(() => releasePolicy(root, [], 443));
});
test('release feed serves only current metadata, never payloads, redirects or unknown requests', async (t) => {
  const feed = await releaseFeed({ limit: 4 });
  t.after(() => feed.close());
  for (const [route, version] of [
    ['app', '0.1.14'],
    ['core', '0.1.19'],
  ]) {
    const reply = await fetch(feed.url + '/' + route + '/latest.json');
    assert.equal(reply.status, 200);
    const value = await reply.json();
    assert.equal(value.version, version);
    assert.deepEqual(value.targets, {});
  }
  for (const options of [
    { route: '/payload.tar' },
    { route: '/app/latest.json', method: 'POST' },
    { route: '/core/latest.json' },
  ]) {
    const reply = await fetch(feed.url + options.route, {
      method: options.method,
    });
    assert.equal(reply.status, 403);
    assert.equal(reply.headers.get('location'), null);
  }
  assert.deepEqual(feed.counts(), { requests: 5, refused: 3 });
  assert.throws(() => feed.assertClean());
});
test('release runner refuses before staging, services or process effects without current authorization', async () => {
  let called = false;
  const report = await runReleaseCalibration(
    { env: {} },
    {
      environment() {
        called = true;
      },
    },
  );
  assert.equal(report.outcome, 'disabled');
  assert.equal(called, false);
});
test('release window setup admits only the exact owned minimize request', () => {
  const {
    WindowChannel,
  } = require('../live/app-calibration/release-scenarios.cjs');
  const channel = new WindowChannel({});
  assert.doesNotThrow(() =>
    channel.validateRequests('app', [{ do: 'window.minimize', args: {} }]),
  );
  for (const request of [
    { do: 'window.close', args: {} },
    { do: 'app.hide_others', args: {} },
    { do: 'window.minimize', args: { window: 'other' } },
    { do: 'pane.zoom', args: {} },
  ])
    assert.throws(() => channel.validateRequests('app', [request]));
});
test('existing build guard refuses a shared-writable App ancestor even when the executable and plist bytes match', async (t) => {
  const { fixtureBuild } = require('../helpers/herdr-app-focus');
  const {
    inspectAppBuild,
  } = require('../../src/terminals/herdr-app/build-files');
  const build = fixtureBuild(t);
  const accepted = await inspectAppBuild(build.executable, build.decoder);
  assert.equal(accepted.executableSha256, build.record.executableSha256);
  fs.chmodSync(build.root, 0o775);
  await assert.rejects(
    inspectAppBuild(build.executable, build.decoder),
    /Build mismatch/,
  );
  assert.throws(() => accepted.assertUnchanged(), /Build mismatch/);
  fs.chmodSync(build.root, 0o700);
});
