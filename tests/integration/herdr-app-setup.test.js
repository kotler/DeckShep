const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { appPeerHelperAvailable } = require('../../src/app/herdr-app-backend');
const { herdrAppChecks } = require('../../src/app/herdr-app-diagnostics');
const { harness } = require('../helpers/plugin-harness');
function directory(t) {
  const home = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-app-setup-')),
  );
  fs.chmodSync(home, 0o700);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}
test('App helper diagnostics inspect only the fixed owned plugin file and reject unsafe or missing helpers', (t) => {
  const plugin = directory(t),
    bin = path.join(plugin, 'bin'),
    helper = path.join(bin, 'herdr-app-peer');
  assert.equal(appPeerHelperAvailable(plugin), false);
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.writeFileSync(helper, 'synthetic helper; never executed', { mode: 0o700 });
  assert.equal(appPeerHelperAvailable(plugin), true);
  for (const mode of [0o600, 0o722]) {
    fs.chmodSync(helper, mode);
    assert.equal(appPeerHelperAvailable(plugin), false);
  }
  fs.chmodSync(helper, 0o700);
  fs.chmodSync(bin, 0o777);
  assert.equal(appPeerHelperAvailable(plugin), false);
  fs.chmodSync(bin, 0o700);
  fs.renameSync(helper, helper + '.saved');
  fs.symlinkSync(helper + '.saved', helper);
  assert.equal(appPeerHelperAvailable(plugin), false);
  fs.unlinkSync(helper);
  fs.mkdirSync(helper);
  assert.equal(appPeerHelperAvailable(plugin), false);
});
test('a packaged-helper factory uses its fixed path and still cannot probe or connect with empty production records', async (t) => {
  const plugin = directory(t),
    helper = path.join(plugin, 'bin/herdr-app-peer');
  fs.mkdirSync(path.dirname(helper), { mode: 0o700 });
  fs.writeFileSync(helper, 'never executed', { mode: 0o700 });
  const sourceFile = path.resolve('src/app/herdr-app-backend.ts'),
    localRequire = createRequire(sourceFile),
    exports = {};
  let selectedHelper,
    probes = 0;
  const code = require('typescript').transpileModule(
    fs.readFileSync(sourceFile, 'utf8'),
    { compilerOptions: { target: 9, module: 1, esModuleInterop: true } },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    process,
    require(name) {
      if (name === '../platform/paths') return { pluginDirectory: plugin };
      if (name === '../platform/app-peer')
        return {
          nativeAppPeerProbe(file) {
            selectedHelper = file;
            return async () => {
              probes++;
              throw Error('unexpected probe');
            };
          },
        };
      return localRequire(name);
    },
  });
  const backend = exports.appFocusBackend;
  assert.equal(backend.recordCount, 0);
  assert.throws(
    () => backend.create({ herdrApp: { home: '' } }, {}),
    /unavailable/,
  );
  const sender = backend.create(
    { herdrApp: { home: plugin, helperPath: '/unused/foreign-helper' } },
    {},
  );
  assert(selectedHelper === helper);
  await assert.rejects(sender.observe(), /Build mismatch/);
  assert.equal(probes, 0);
  sender.dispose();
});
test('App setup/doctor reports profile consent and disabled build state without querying Rex/TUI or exposing paths', async () => {
  const h = harness({ experimentalHerdrApp: true });
  await h.appear('herdr-app');
  const context = 'herdr-app:0,0';
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'sendToPlugin',
      context,
      payload: {
        kind: 'preferences',
        preferences: {
          herdrAppHome: '/sample/app',
          herdrAppFocusRequestEnabled: true,
        },
      },
    }),
  );
  await h.api.settled();
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'sendToPlugin',
      context,
      payload: { kind: 'doctor' },
    }),
  );
  await h.api.settled();
  const report = h.socket.frames
    .filter((frame) => frame.event === 'sendToPropertyInspector')
    .at(-1).payload;
  assert.equal(report.kind, 'doctor');
  assert.deepEqual(report.sessions, []);
  assert.equal(
    report.checks.find((check) => check.id === 'herdr-app-consent').ok,
    true,
  );
  assert.equal(
    report.checks.find((check) => check.id === 'herdr-app-builds').ok,
    false,
  );
  assert(!JSON.stringify(report).includes('/sample/app'));
  const positive = herdrAppChecks({
    helperAvailable: true,
    recordCount: 1,
    homeConfigured: true,
    focusRequestEnabled: true,
    connected: true,
  });
  assert(positive.every((check) => check.ok && check.reason.length <= 160));
  const negative = herdrAppChecks({
    helperAvailable: false,
    recordCount: 0,
    homeConfigured: false,
    focusRequestEnabled: false,
    connected: false,
  });
  assert(negative.slice(0, -1).every((check) => !check.ok));
});
test('App CLI doctor uses passive App-only reporting with a private HOME and no native connection', (t) => {
  const home = directory(t),
    root = path.resolve('.');
  let output;
  try {
    output = execFileSync(
      process.execPath,
      [
        '--require',
        'tsx/cjs',
        'src/plugin/doctor-entry.ts',
        '--herdr-app',
        '--json',
      ],
      {
        cwd: root,
        env: { PATH: process.env.PATH, HOME: home },
        timeout: 5000,
        encoding: 'utf8',
        maxBuffer: 16000,
      },
    );
  } catch {
    throw Error('Fixture doctor failed');
  }
  const report = JSON.parse(output);
  assert(report.every((check) => check.id.startsWith('herdr-app-')));
  assert.equal(
    report.find((check) => check.id === 'herdr-app-builds').ok,
    false,
  );
  assert(
    report
      .find((check) => check.id === 'herdr-app-consent')
      .reason.includes('profile setup'),
  );
  assert(!output.includes(home));
  assert(!output.includes(root));
  assert.deepEqual(fs.readdirSync(home), []);
});
