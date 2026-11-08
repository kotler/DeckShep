const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createConnection } = require('node:net');
const { nativeAppPeerProbe } = require('../../src/platform/app-peer');
const { validate } = require('../../src/schemas');
const { fakeServer } = require('../helpers/herdr-app-server');
function run(binary, args, options) {
  try {
    return execFileSync(binary, args, options);
  } catch {
    throw Error('Native fixture command failed');
  }
}

function temporary(t) {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-peer-')),
  );
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
test(
  'macOS descriptor probe checks only its signed fixture process and private test-owned peer',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const directory = temporary(t),
      output = path.join(directory, 'peer-fixture'),
      cache = path.join(directory, 'module-cache');
    run(
      'swiftc',
      [
        '-O',
        '-target',
        process.arch + '-apple-macosx13.0',
        '-module-cache-path',
        cache,
        'native/herdr-app-peer.swift',
        'tests/fixtures/herdr-app-peer-main.swift',
        '-lbsm',
        '-o',
        output,
      ],
      { timeout: 60000, stdio: 'pipe' },
    );
    run('/usr/bin/codesign', ['--force', '--sign', '-', output], {
      stdio: 'pipe',
    });
    const evidence = validate(
      'herdrAppPeer',
      JSON.parse(
        run(output, [directory], {
          timeout: 3000,
          maxBuffer: 8192,
          encoding: 'utf8',
        }),
      ),
    );
    assert(evidence.executable === output);
    assert(evidence.pid > 0);
    assert.equal(evidence.uid, process.getuid());
    assert.match(evidence.cdHash, /^[a-f0-9]{40,64}$/);
    // The real CLI also compiles for both supported macOS architectures.
    for (const architecture of ['arm64', 'x86_64'])
      run(
        'swiftc',
        [
          '-typecheck',
          '-target',
          architecture + '-apple-macosx13.0',
          '-module-cache-path',
          cache,
          'native/herdr-app-peer.swift',
          'native/herdr-app-peer-main.swift',
        ],
        { timeout: 60000, stdio: 'pipe' },
      );
  },
);
test(
  'native adapter passes only the connected descriptor and bounds helper output, failure and cancellation',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const previous = process.env.DECKSHEP_PEER_FIXTURE_ENV;
    process.env.DECKSHEP_PEER_FIXTURE_ENV = 'synthetic';
    t.after(() => {
      if (previous === undefined) delete process.env.DECKSHEP_PEER_FIXTURE_ENV;
      else process.env.DECKSHEP_PEER_FIXTURE_ENV = previous;
    });
    const directory = temporary(t),
      peer = await fakeServer(t, () => {}),
      socket = createConnection(peer.file);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    t.after(() => socket.destroy());
    function helper(source) {
      const file = path.join(
        directory,
        'helper-' + fs.readdirSync(directory).length,
      );
      fs.writeFileSync(file, '#!' + process.execPath + '\n' + source, {
        mode: 0o700,
      });
      return file;
    }
    const probe = nativeAppPeerProbe(
      helper(`
      const fs = require('node:fs');
      process.stdout.write(JSON.stringify({ descriptor: fs.fstatSync(3).isSocket(),
        clean: !process.env.DECKSHEP_PEER_FIXTURE_ENV && !process.env.NODE_OPTIONS &&
          !Object.keys(process.env).some(key => key.startsWith('DYLD_')) }));
    `),
    );
    assert.deepEqual(await probe(socket), { descriptor: true, clean: true });
    for (const source of [
      'process.stdout.write("not JSON")',
      'process.stdout.write(Buffer.from([255]))',
      'process.stdout.write("x".repeat(9000)); setInterval(() => {}, 1000)',
      'process.exit(1)',
      'setInterval(() => {}, 1000)',
    ])
      await assert.rejects(
        nativeAppPeerProbe(helper(source))(socket),
        /Peer unverified/,
      );
    await assert.rejects(
      nativeAppPeerProbe(path.join(directory, 'missing'))(socket),
      /Peer unverified/,
    );
    assert.throws(() => nativeAppPeerProbe('relative'), /Peer unverified/);
    assert.throws(
      () => nativeAppPeerProbe('/private/\ninvalid'),
      /Peer unverified/,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(probe(socket, controller.signal), /Peer unverified/);
    const active = new AbortController();
    const pending = nativeAppPeerProbe(helper('setInterval(() => {}, 1000)'))(
      socket,
      active.signal,
    );
    active.abort();
    await assert.rejects(pending, /Peer unverified/);
    assert.deepEqual(peer.calls, []);
  },
);
