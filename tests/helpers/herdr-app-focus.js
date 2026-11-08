const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fakeServer } = require('./herdr-app-server');
const { AppPeerVerifier } = require('../../src/terminals/herdr-app/peer');
const {
  GuardedAppFocusSender,
} = require('../../src/terminals/herdr-app/focus-sender');
const { AppFocusAuthority } = require('../../src/guards/app-focus-request');
const f = require('../fixtures/backends/herdr-app/index.cjs');
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function fixtureBuild(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-build-')),
  );
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'Sample.app/Contents/MacOS/Herdr'),
    plist = path.join(root, 'Sample.app/Contents/Info.plist'),
    bytes = Buffer.from('Synthetic artifact, never executed'),
    metadata = {
      CFBundleIdentifier: 'dev.herdr.app',
      CFBundleExecutable: 'Herdr',
      CFBundleShortVersionString: '0.1.14',
      CFBundleVersion: '0.1.14',
    };
  fs.mkdirSync(path.dirname(executable), { recursive: true, mode: 0o700 });
  fs.writeFileSync(executable, bytes, { mode: 0o600 });
  fs.writeFileSync(plist, JSON.stringify(metadata), { mode: 0o600 });
  const evidence = {
    protocol: 1,
    pid: process.pid,
    uid: process.getuid(),
    pidVersion: 1,
    startSeconds: '123',
    startMicros: 456,
    executable,
    cdHash: 'a'.repeat(40),
  };
  const record = {
    key: 'fixture-request-only',
    contract: 1,
    bundleId: 'dev.herdr.app',
    executable: 'Herdr',
    version: '0.1.14',
    build: '0.1.14',
    executableSha256: hash(bytes),
    plistSha256: hash(fs.readFileSync(plist)),
    cdHash: evidence.cdHash,
  };
  return {
    root,
    executable,
    plist,
    evidence,
    record,
    metadata,
    decoder: async (bytes) => JSON.parse(bytes.toString()),
  };
}
function focusState() {
  return {
    scope: 'herdr-app',
    control: 'requestFocus',
    appearance: 1,
    visibility: 1,
    generation: 1,
    backendKey: 'fixture-backend',
    page: 0,
    stamp: 'fixture-stamp',
    armedAt: 500,
    endpointGeneration: 1,
    peerKey: 'peer',
    recordKey: 'record',
    target: { space: 's1', tab: 'c1', pane: 'p1', terminal: 't1' },
    visible: true,
    setupBusy: false,
    focusRequestEnabled: true,
  };
}
async function senderFixture(t, options = {}) {
  const build = fixtureBuild(t),
    world = structuredClone(f.world),
    state = focusState();
  let now = 1000,
    probes = 0;
  const commands = [
    {
      name: 'pane.focus',
      about: 'Focus a pane.',
      args: [
        { name: 'pane', required: false },
        { name: 'terminal', required: false },
      ],
    },
  ];
  const peer = await fakeServer(
    t,
    (socket, request, calls) => {
      if (options.respond?.(socket, request, calls) === true) return;
      socket.end(
        JSON.stringify(
          request.ls
            ? world
            : request.commands
              ? commands
              : request.status
                ? f.status
                : { ok: true },
        ) + '\n',
      );
    },
    'herdr-app.sock',
  );
  const verifier = new AppPeerVerifier(
    async (socket, signal) => {
      probes++;
      await options.probe?.({ socket, signal, peer, state, build, probes });
      return structuredClone(build.evidence);
    },
    [build.record],
    build.decoder,
  );
  const authority = new AppFocusAuthority(
    () => state,
    () => now,
  );
  const sender = new GuardedAppFocusSender(verifier, authority, {
    appHome: peer.directory,
  });
  t.after(() => sender.dispose());
  await sender.observe();
  function permit() {
    state.endpointGeneration = sender.generation;
    state.peerKey = sender.peerKey;
    state.recordKey = sender.recordKey;
    return authority.issue({ ...structuredClone(state), pressedAt: now });
  }
  return {
    build,
    world,
    state,
    peer,
    sender,
    authority,
    commands,
    permit,
    setNow: (value) => {
      now = value;
    },
    focusCalls: () => peer.calls.filter((call) => call.do),
  };
}
module.exports = { fixtureBuild, senderFixture, focusState, hash };
