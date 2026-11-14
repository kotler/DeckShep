const path = require('node:path');
const { exec } = require('../../../src/platform/exec');
const { nativeAppPeerProbe } = require('../../../src/platform/app-peer');
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

/** Owner-approved private preview only. Keep the existing distribution-denied
 * marker; a normal build cannot select this factory through config or env. */
function publisherCheck(run = exec) {
  let lastBuild;
  return async (file, cdHash, binarySha256, plistSha256) => {
    if (
      !/^[a-f0-9]{40}$/.test(cdHash) ||
      !file.endsWith('.app/Contents/MacOS/Herdr')
    )
      throw Error('Peer unverified');
    const identity = JSON.stringify([file, cdHash, binarySha256, plistSha256]);
    if (identity === lastBuild) return;
    const bundle = path.dirname(path.dirname(path.dirname(file)));
    // The hash comes from the live socket peer. Bind that same signing image
    // to Herdr's Developer ID without restricting its marketing/build version.
    const requirement =
      '=anchor apple generic and identifier "dev.herdr.app" and certificate leaf[subject.OU] = "2W9652Q7QR" and cdhash H"' +
      cdHash +
      '"';
    await run(
      '/usr/bin/codesign',
      ['--verify', '--strict', '-R', requirement, bundle],
      {
        timeout: 500,
        message: 'Peer unverified',
      },
    );
    lastBuild = identity;
  };
}
function releasePreviewBackend(helperSha256) {
  const verifyPublisher = publisherCheck();
  return {
    kind: 'fixture-app-hardware-test',
    recordCount: 1,
    helperAvailable: () => appPeerHelperAvailable(),
    create(config, authority) {
      if (!config.herdrApp?.home || !appPeerHelperAvailable())
        throw Error('App unavailable');
      const helper = path.join(pluginDirectory, 'bin/herdr-app-peer');
      const native = nativeAppPeerSession(helper, helperSha256);
      const verifier = new AppPeerVerifier(
        nativeAppPeerProbe(helper),
        [],
        undefined,
        native,
        verifyPublisher,
      );
      return new GuardedAppFocusSender(verifier, authority, {
        appHome: config.herdrApp.home,
      });
    },
  };
}
module.exports = { releasePreviewBackend, publisherCheck };
