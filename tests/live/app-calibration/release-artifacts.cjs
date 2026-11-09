const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const TEAM = '2W9652Q7QR';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function stamp(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.uid,
    stat.mode,
    stat.nlink,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].join(':');
}
function trusted(stat) {
  return (
    [0n, BigInt(process.getuid())].includes(stat.uid) && !(stat.mode & 0o022n)
  );
}
function read(file) {
  const before = fs.lstatSync(file, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    !trusted(before) ||
    before.size > 256n * 1024n * 1024n ||
    before.mode & 0o6000n
  )
    throw Error();
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    if (stamp(before) !== stamp(fs.fstatSync(fd, { bigint: true })))
      throw Error();
    const bytes = fs.readFileSync(fd);
    if (
      stamp(before) !== stamp(fs.fstatSync(fd, { bigint: true })) ||
      stamp(before) !== stamp(fs.lstatSync(file, { bigint: true }))
    )
      throw Error();
    return { bytes, mode: Number(before.mode & 0o777n) };
  } finally {
    fs.closeSync(fd);
  }
}
function bundleFiles(bundle) {
  if (
    !path.isAbsolute(bundle) ||
    fs.realpathSync(bundle) !== bundle ||
    !bundle.endsWith('.app')
  )
    throw Error();
  const files = new Map();
  let total = 0;
  function visit(directory, relative = '', depth = 0) {
    const stat = fs.lstatSync(directory, { bigint: true });
    if (
      depth > 20 ||
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      !trusted(stat)
    )
      throw Error();
    for (const name of fs.readdirSync(directory).sort()) {
      if (/[\x00-\x1f\x7f\\]/.test(name)) throw Error();
      const file = path.join(directory, name),
        key = path.join(relative, name);
      if (fs.lstatSync(file).isDirectory()) visit(file, key, depth + 1);
      else {
        const value = read(file);
        files.set(key, value);
        total += value.bytes.length;
      }
      if (files.size > 2000 || total > 512 * 1024 * 1024) throw Error();
    }
  }
  visit(bundle);
  return files;
}
function inventory(files) {
  return [...files].map(([name, value]) => [
    name,
    hash(value.bytes),
    value.mode,
  ]);
}
function same(files, bundle) {
  if (
    JSON.stringify(inventory(files)) !==
    JSON.stringify(inventory(bundleFiles(bundle)))
  )
    throw Error();
}
function copyBundle(files, destination) {
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const [name, value] of files) {
    const file = path.join(destination, name);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, value.bytes, { flag: 'wx', mode: value.mode });
  }
}
function command(file, args) {
  return execFileSync(file, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 65536,
  });
}
function decodePlist(bytes) {
  return JSON.parse(
    execFileSync(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', '--', '-'],
      {
        input: bytes,
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 3000,
        maxBuffer: 65536,
      },
    ),
  );
}
function verifySignature(bundle, identifier) {
  // This validates files through the system signature service; it never starts
  // Herdr. Sandboxed callers may receive refusal even for a valid Developer ID.
  command('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    '-R',
    `=identifier "${identifier}" and anchor apple generic and certificate leaf[subject.OU] = "${TEAM}"`,
    bundle,
  ]);
}
function signatureEvidence(bundle, identifier) {
  verifySignature(bundle, identifier);
  const result = require('node:child_process').spawnSync(
    '/usr/bin/codesign',
    ['-d', '--verbose=4', bundle],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 65536 },
  );
  if (result.status !== 0) throw Error();
  const lines = result.stderr.split('\n'),
    field = (name) =>
      lines.find((line) => line.startsWith(name + '='))?.slice(name.length + 1);
  const cdHash = field('CDHash');
  if (
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(cdHash || '') ||
    field('TeamIdentifier') !== TEAM ||
    field('Identifier') !== identifier
  )
    throw Error();
  return {
    valid: true,
    cdHash,
    teamIdentifier: TEAM,
    publisherRequirementVerified: true,
  };
}
function describe(files, identity, decoder) {
  const plist = files.get('Contents/Info.plist');
  if (!plist) throw Error();
  const value = decoder(plist.bytes);
  if (
    value.CFBundleIdentifier !== identity.id ||
    value.CFBundleExecutable !== identity.executable ||
    !['CFBundleVersion', 'CFBundleShortVersionString'].every(
      (key) =>
        typeof value[key] === 'string' && /^\d+\.\d+\.\d+$/.test(value[key]),
    )
  )
    throw Error();
  const executable = files.get('Contents/MacOS/' + identity.executable);
  if (!executable || !(executable.mode & 0o111)) throw Error();
  return {
    bundleId: identity.id,
    version: value.CFBundleShortVersionString,
    build: value.CFBundleVersion,
    executableSha256: hash(executable.bytes),
    plistSha256: hash(plist.bytes),
    treeSha256: hash(JSON.stringify(inventory(files))),
    files: files.size,
  };
}

/** Inspection-only copy, deliberately incompatible with the live source-build
 * manifest. No settings, tokens, shell profile, socket or process is inspected. */
async function prepareReleaseCandidate(
  { appBundle, coreBundle, helper, destination },
  effects = {},
) {
  let created = false;
  try {
    const decoder = effects.decodePlist ?? decodePlist,
      verify = effects.verifySignature ?? signatureEvidence;
    const parent = path.dirname(destination),
      parentStat = fs.lstatSync(parent);
    if (
      !path.isAbsolute(destination) ||
      fs.realpathSync(parent) !== parent ||
      !parentStat.isDirectory() ||
      parentStat.uid !== process.getuid() ||
      parentStat.mode & 0o077
    )
      throw Error();
    const app = bundleFiles(appBundle),
      core = bundleFiles(coreBundle),
      peer = read(helper);
    if (!(peer.mode & 0o111)) throw Error();
    const identities = {
      app: { id: 'dev.herdr.app', executable: 'Herdr' },
      core: { id: 'dev.herdr.core', executable: 'herdr-core' },
    };
    const evidence = {
      app: describe(app, identities.app, decoder),
      core: describe(core, identities.core, decoder),
    };
    for (const kind of ['app', 'core']) {
      const value = await verify(
        kind === 'app' ? appBundle : coreBundle,
        identities[kind].id,
      );
      if (
        value.valid !== true ||
        value.publisherRequirementVerified !== true ||
        value.teamIdentifier !== TEAM ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.cdHash)
      )
        throw Error();
      evidence[kind].signature = value;
    }
    same(app, appBundle);
    same(core, coreBundle);
    fs.mkdirSync(destination, { mode: 0o700 });
    created = true;
    const copies = {
      app: path.join(destination, 'Herdr.app'),
      core: path.join(destination, 'Herdr Core.app'),
    };
    copyBundle(app, copies.app);
    copyBundle(core, copies.core);
    fs.writeFileSync(path.join(destination, 'herdr-app-peer'), peer.bytes, {
      mode: peer.mode,
      flag: 'wx',
    });
    for (const kind of ['app', 'core']) {
      same(kind === 'app' ? app : core, copies[kind]);
      if (
        JSON.stringify(await verify(copies[kind], identities[kind].id)) !==
        JSON.stringify(evidence[kind].signature)
      )
        throw Error();
    }
    same(app, appBundle);
    same(core, coreBundle);
    if (hash(read(helper).bytes) !== hash(peer.bytes)) throw Error();
    const report = {
      schema: 1,
      buildMode: 'installed-release-candidate',
      candidateOnly: true,
      nativeExecution: false,
      approvedForLiveRun: false,
      productionApproved: false,
      verifiedFocus: false,
      runningPairEstablished: false,
      sourceAndCopiesStable: true,
      ...evidence,
      helper: { protocol: 2, sha256: hash(peer.bytes) },
      gates: [
        'updater-containment',
        'separate-live-authorization',
        'native-release-calibration',
      ],
    };
    fs.writeFileSync(
      path.join(destination, 'release-candidate.json'),
      JSON.stringify(report, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    return report;
  } catch {
    if (created) {
      try {
        fs.rmSync(destination, { recursive: true, force: true });
      } catch {
        throw Error('Release staging cleanup failed');
      }
    }
    throw Error('Release staging refused');
  }
}
module.exports = {
  prepareReleaseCandidate,
  bundleFiles,
  inventory,
  signatureEvidence,
};
