const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { privateDirectory } = require('./artifacts.cjs');

function quoted(value) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f\\"]/.test(value))
    throw Error('Unsafe release policy');
  return '"' + value + '"';
}
/** No executable stages, shell, open, launchctl, generic network or user HOME.
 * Bundles are read-only even to the App updater. Only runtime state is writable.
 * This is a test policy, not a production security boundary or public API. */
function releasePolicy(root, executables, port) {
  privateDirectory(root);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('Unsafe release policy');
  for (const file of executables)
    if (
      !file.startsWith(root + path.sep) &&
      !['/bin/cat', '/usr/bin/curl'].includes(file)
    )
      throw Error('Unsafe release policy');
  const services = [
    'com.apple.windowserver.active',
    'com.apple.WindowServer',
    'com.apple.cfprefsd.agent',
    'com.apple.cfprefsd.daemon',
    'com.apple.trustd.agent',
    'com.apple.trustd',
    'com.apple.system.logger',
    'com.apple.logd',
    'com.apple.system.notification_center',
    'com.apple.fonts',
    'com.apple.FontObjectsServer',
    'com.apple.fontd',
    'com.apple.distributed_notifications@Uv3',
    'com.apple.MTLCompilerService',
    'com.apple.cvmsServ',
    'com.apple.hiservices-xpcservice',
    'com.apple.coreservices.launchservicesd',
    'com.apple.CoreServices.coreservicesd',
    'com.apple.CARenderServer',
    'com.apple.tccd',
    'com.apple.tccd.system',
  ];
  return (
    [
      '(version 1)',
      '(deny default)',
      '(deny lsopen appleevent-send)',
      '(import "dyld-support.sb")',
      '(allow mach-bootstrap syscall*)',
      '(allow file-map-executable (subpath "/System") (subpath "/usr/lib") ' +
        executables.map((p) => '(literal ' + quoted(p) + ')').join(' ') +
        ')',
      '(allow file-read-metadata)',
      '(allow file-read* ' +
        [
          root,
          '/System',
          '/usr',
          '/bin',
          '/sbin',
          '/Library/Fonts',
          '/Library/Preferences',
          '/private/etc',
          '/private/var/db',
          '/dev',
        ]
          .map((p) => '(subpath ' + quoted(p) + ')')
          .join(' ') +
        ')',
      '(allow file-write* (subpath ' +
        quoted(path.join(root, 'state')) +
        ') (literal "/dev/null") (regex #"^/dev/[pt]ty"))',
      '(allow process-exec ' +
        executables.map((p) => '(literal ' + quoted(p) + ')').join(' ') +
        ')',
      '(allow process-fork)',
      '(allow file-read* file-write-data file-ioctl (literal "/dev/ptmx") (regex #"^/dev/[pt]ty"))',
      '(allow signal (target same-sandbox))',
      '(allow process-info* (target same-sandbox))',
      '(allow sysctl-read)',
      '(allow pseudo-tty)',
      '(allow iokit-open)',
      '(allow ipc-posix-shm-read* (ipc-posix-name "apple.shm.notification_center"))',
      '(allow mach-lookup ' +
        services.map((s) => '(global-name ' + quoted(s) + ')').join(' ') +
        ')',
      '(allow network-bind network-inbound network-outbound (subpath ' +
        quoted(path.join(root, 'state')) +
        '))',
      '(allow network-outbound (remote tcp "localhost:' + port + '"))',
    ].join('\n') + '\n'
  );
}
async function releaseFeed({ limit = 8 } = {}) {
  let requests = 0,
    refused = 0;
  const routes = {
    '/app/latest.json': { version: '0.1.14', targets: {} },
    '/core/latest.json': { version: '0.1.19', generation: 1, targets: {} },
  };
  const server = http.createServer((request, response) => {
    requests++;
    if (
      request.method !== 'GET' ||
      !Object.hasOwn(routes, request.url) ||
      requests > limit ||
      request.headers['transfer-encoding'] ||
      Number(request.headers['content-length'] || 0) !== 0
    ) {
      refused++;
      response.writeHead(403, { Connection: 'close' });
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/json',
      Connection: 'close',
    });
    response.end(JSON.stringify(routes[request.url]));
  });
  server.headersTimeout = 1000;
  server.requestTimeout = 1000;
  server.maxConnections = 4;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    url: 'http://127.0.0.1:' + server.address().port,
    counts: () => ({ requests, refused }),
    assertClean() {
      if (refused) throw Error('Release feed refused');
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
function writePolicy(root, executables, port) {
  const file = path.join(root, 'release.sb');
  fs.writeFileSync(file, releasePolicy(root, executables, port), {
    mode: 0o600,
    flag: 'wx',
  });
  return file;
}
module.exports = { releasePolicy, releaseFeed, writePolicy };
