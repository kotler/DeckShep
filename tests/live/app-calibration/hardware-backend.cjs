const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../../../src/schemas');
const {
  nativeAppPeerSession,
} = require('../../../src/platform/app-peer-session');
const { pluginDirectory } = require('../../../src/platform/paths');
const { AppPeerVerifier } = require('../../../src/terminals/herdr-app/peer');
const {
  GuardedAppFocusSender,
} = require('../../../src/terminals/herdr-app/focus-sender');
const {
  appPeerHelperAvailable,
} = require('../../../src/app/herdr-app-backend');

/** Test bundle only. Production audit rejects this marker; no config/env knob
 * can select this factory in a normal build. Lease is issued by the owned runner. */
function hardwareBackend(root, record, helperSha256) {
  function read(name) {
    const directory = fs.lstatSync(root),
      file = path.join(root, name),
      stat = fs.lstatSync(file);
    if (
      fs.realpathSync(root) !== root ||
      !directory.isDirectory() ||
      directory.uid !== process.getuid() ||
      directory.mode & 0o077 ||
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid() ||
      stat.mode & 0o077 ||
      stat.size > 8192
    )
      throw Error('App unavailable');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return {
    kind: 'fixture-app-hardware-test',
    recordCount: 1,
    helperAvailable: () => appPeerHelperAvailable(),
    create(config, authority) {
      const home = path.join(root, 'session/app');
      if (config.herdrApp?.home !== home) throw Error('App unavailable');
      const lease = read('lease.json'),
        original = JSON.stringify(lease);
      const peer = validate('herdrAppPeer', lease.app);
      if (
        peer.executable !==
          path.join(root, 'session/bin/Herdr.app/Contents/MacOS/Herdr') ||
        peer.cdHash !== record.cdHash
      )
        throw Error('App unavailable');
      function current() {
        const heartbeat = read('heartbeat.json'),
          now = Date.now();
        if (
          JSON.stringify(read('lease.json')) !== original ||
          heartbeat.nonce !== lease.nonce ||
          !Number.isSafeInteger(heartbeat.at) ||
          now < heartbeat.at ||
          now - heartbeat.at >= 1000
        )
          throw Error('App unavailable');
      }
      const native = nativeAppPeerSession(
        path.join(pluginDirectory, 'bin/herdr-app-peer'),
        helperSha256,
      );
      const verifier = new AppPeerVerifier(
        async () => {
          throw Error('Peer unverified');
        },
        [record],
        undefined,
        async (socket, signal) => {
          current();
          const session = await native(socket, signal);
          function check(value) {
            current();
            if (
              JSON.stringify(validate('herdrAppPeer', value)) !==
              JSON.stringify(peer)
            )
              throw Error('Peer unverified');
            return value;
          }
          try {
            return {
              captured: check(session.captured),
              check: async () => check(await session.check()),
              finish: async () => check(await session.finish()),
              dispose: () => session.dispose(),
            };
          } catch {
            await session.dispose();
            throw Error('Peer unverified');
          }
        },
      );
      return new GuardedAppFocusSender(verifier, authority, { appHome: home });
    },
  };
}

module.exports = { hardwareBackend };
