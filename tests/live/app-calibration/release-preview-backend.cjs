const path = require('node:path');
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

// Private preview packaging retains its distribution-denied marker.
const {
  publisherCheck,
} = require('../../../src/terminals/herdr-app/publisher');
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
