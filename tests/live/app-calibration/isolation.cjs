const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { authorization } = require('../safety.cjs');
const { isolatedEnvironment } = require('../environment.cjs');
const { inspectSocket } = require('../../../src/terminals/herdr-app/endpoint');
const { validate } = require('../../../src/schemas');
const { privateDirectory } = require('./artifacts.cjs');

function appAuthorization(env = process.env) {
  return (
    authorization('herdr-app', env) ||
    (env.ASW_LIVE_HERDR_APP !== '1'
      ? 'App calibration also requires ASW_LIVE_HERDR_APP=1'
      : null)
  );
}
function appEnvironment(root, core) {
  privateDirectory(root);
  const env = isolatedEnvironment(root, {});
  Object.assign(env, {
    PATH: path.dirname(core) + ':/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C',
    HERDR_APP_HOME: path.join(root, 'app'),
    HC_SESSION: 'dsh-' + randomBytes(6).toString('hex'),
    HC_SOCKET: path.join(root, 'c.sock'),
    XDG_RUNTIME_DIR: path.join(root, 'run'),
    HERDR_CORE_DIRS: path.dirname(core),
    HERDR_TELEMETRY: '0',
    DO_NOT_TRACK: '1',
    HERDR_APP_NO_SOUND: '1',
  });
  for (const directory of [env.HERDR_APP_HOME, env.XDG_RUNTIME_DIR])
    fs.mkdirSync(directory, { mode: 0o700 });
  // Bound the longest holder path too (8 hex digits plus separator).
  if (
    Buffer.byteLength(env.HC_SOCKET.replace(/\.sock$/, '.holder.sock')) + 9 >
      103 ||
    Buffer.byteLength(path.join(env.HERDR_APP_HOME, 'herdr-app.sock')) > 103
  )
    throw Error('Calibration socket path too long');
  fs.writeFileSync(
    path.join(env.HERDR_APP_HOME, 'settings.json'),
    JSON.stringify({
      core,
      telemetry: false,
      clipboard_write: false,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  return env;
}
/** Paths are checked before connect; kernel peer credentials before any bytes.
 * App/core socket PIDs must be the direct children we launched, never adopted. */
class OwnedEndpoints {
  constructor(root, env, artifacts, owned, probe, children, signal) {
    Object.assign(this, {
      root,
      env,
      artifacts,
      owned,
      probe,
      children,
      signal,
    });
    this.files = {
      app: path.join(env.HERDR_APP_HOME, 'herdr-app.sock'),
      core: env.HC_SOCKET,
    };
    this.paths = new Map();
    this.peers = new Map();
    this.peerChecks = 0;
  }
  check(kind) {
    this.signal?.throwIfAborted();
    privateDirectory(this.root);
    this.artifacts.assertUnchanged();
    this.assertChildren();
    const file = this.files[kind];
    if (!file || !file.startsWith(this.root + path.sep))
      throw Error('Non-owned calibration endpoint');
    const endpoint = inspectSocket(file),
      previous = this.paths.get(kind);
    if (previous && endpoint.identity !== previous)
      throw Error('Calibration endpoint changed');
    this.paths.set(kind, endpoint.identity);
    return endpoint;
  }
  checkBoth() {
    this.check('core');
    if (this.children.app) this.check('app');
  }
  assertChildren() {
    try {
      for (const child of Object.values(this.children))
        this.owned.assert(child.pid);
    } catch {
      this.ownershipLost = true;
      throw Error('Calibration process changed');
    }
  }
  captureDescendants() {
    this.assertChildren();
    try {
      this.owned.captureDescendants();
    } catch {
      this.ownershipLost = true;
      throw Error('Calibration descendants unverified');
    }
    this.assertChildren();
  }
  async peer(kind, socket, signal) {
    this.peerChecks++;
    this.checkBoth();
    const before = validate(
      'herdrAppPeer',
      await this.probe(socket, signal, kind),
    );
    this.checkBoth();
    const executable = this.artifacts[kind],
      child = this.children[kind],
      cdHash =
        kind === 'app'
          ? this.artifacts.manifest.appRecord.cdHash
          : this.artifacts.manifest.core.cdHash;
    if (
      !child ||
      before.pid !== child.pid ||
      before.uid !== process.getuid() ||
      before.executable !== executable ||
      before.cdHash !== cdHash
    )
      throw Error('Non-owned calibration peer');
    this.owned.assert(before.pid);
    const key = JSON.stringify(before),
      previous = this.peers.get(kind);
    if (previous && key !== previous) throw Error('Calibration peer changed');
    this.peers.set(kind, key);
    this.owned.observe(before.pid);
    return before;
  }
}
module.exports = { appAuthorization, appEnvironment, OwnedEndpoints };
