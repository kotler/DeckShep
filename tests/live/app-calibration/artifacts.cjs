const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { z } = require('zod');
const { validate } = require('../../../src/schemas');
const {
  inspectAppBuild,
} = require('../../../src/terminals/herdr-app/build-files');

const APP_SOURCE = '2405bf388c568c3ed479f05b8e405ccfa44b3f2c';
const CORE_SOURCE = '3965a46caae095a3ead01de237fa13955e52b8c6';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z
  .object({
    schema: z.literal(1),
    buildMode: z.literal('source-no-updater'),
    appSource: z.literal(APP_SOURCE),
    coreSource: z.literal(CORE_SOURCE),
    appTreeSha256: digest,
    appRecord: z.unknown(),
    core: z
      .object({
        version: z.literal('0.1.18'),
        sha256: digest,
        cdHash: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
      })
      .strict(),
    helperSha256: digest,
  })
  .strict();
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function stamp(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.uid,
    stat.nlink,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].join(':');
}
function privateDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (
    !path.isAbsolute(directory) ||
    fs.realpathSync(directory) !== directory ||
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw Error('Unsafe calibration artifacts');
}
function readArtifact(file, limit = 256 * 1024 * 1024) {
  const before = fs.lstatSync(file, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== BigInt(process.getuid()) ||
    before.nlink !== 1n ||
    before.mode & 0o022n ||
    before.size < 1n ||
    before.size > BigInt(limit)
  )
    throw Error('Unsafe calibration artifacts');
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    if (stamp(before) !== stamp(fs.fstatSync(descriptor, { bigint: true })))
      throw Error();
    const bytes = fs.readFileSync(descriptor);
    if (
      stamp(before) !== stamp(fs.fstatSync(descriptor, { bigint: true })) ||
      stamp(before) !== stamp(fs.lstatSync(file, { bigint: true }))
    )
      throw Error();
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}
function treeFiles(directory, relative = '', files = new Map()) {
  if (relative.split(path.sep).length > 32)
    throw Error('Oversized calibration artifacts');
  const current = path.join(directory, relative),
    stat = fs.lstatSync(current);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o022
  )
    throw Error('Unsafe calibration artifacts');
  for (const name of fs.readdirSync(current).sort()) {
    if (/[\x00-\x1f\x7f]/.test(name))
      throw Error('Unsafe calibration artifacts');
    const entry = path.join(relative, name),
      file = path.join(directory, entry);
    if (fs.lstatSync(file).isDirectory()) treeFiles(directory, entry, files);
    else files.set(entry, readArtifact(file));
    if (
      files.size > 2000 ||
      [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0) >
        512 * 1024 * 1024
    )
      throw Error('Oversized calibration artifacts');
  }
  return files;
}
function treeHash(files) {
  return hash(
    JSON.stringify([...files].map(([name, bytes]) => [name, hash(bytes)])),
  );
}
/** A separately reviewed manifest pins test artifacts, never a production allowlist.
 * The build-mode field is a builder attestation, not proof inferred from a version. */
async function stageArtifacts(directory, destination, decoder) {
  privateDirectory(directory);
  const manifest = manifestSchema.parse(
      JSON.parse(readArtifact(path.join(directory, 'manifest.json'), 65536)),
    ),
    record = validate('herdrAppFocusRecord', manifest.appRecord),
    bundle = path.join(directory, 'Herdr.app'),
    files = treeFiles(bundle),
    core = readArtifact(path.join(directory, 'herdr-core')),
    helper = readArtifact(path.join(directory, 'herdr-app-peer'));
  if (
    record.version !== '0.1.14' ||
    record.build !== '0.1.14' ||
    treeHash(files) !== manifest.appTreeSha256 ||
    hash(core) !== manifest.core.sha256 ||
    hash(helper) !== manifest.helperSha256
  )
    throw Error('Calibration build mismatch');
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const [name, bytes] of files) {
    const file = path.join(destination, 'Herdr.app', name);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o700 });
  }
  const app = path.join(destination, 'Herdr.app/Contents/MacOS/Herdr'),
    coreFile = path.join(destination, 'herdr-core'),
    helperFile = path.join(destination, 'herdr-app-peer');
  fs.writeFileSync(coreFile, core, { flag: 'wx', mode: 0o700 });
  fs.writeFileSync(helperFile, helper, { flag: 'wx', mode: 0o700 });
  const build = await inspectAppBuild(app, decoder);
  for (const key of [
    'bundleId',
    'executable',
    'version',
    'build',
    'executableSha256',
    'plistSha256',
  ])
    if (build[key] !== record[key]) throw Error('Calibration build mismatch');
  const tracked = [
    coreFile,
    helperFile,
    ...[...files.keys()].map((name) =>
      path.join(destination, 'Herdr.app', name),
    ),
  ].map((file) => [file, stamp(fs.lstatSync(file, { bigint: true }))]);
  function assertUnchanged() {
    build.assertUnchanged();
    for (const [file, expected] of tracked)
      if (stamp(fs.lstatSync(file, { bigint: true })) !== expected)
        throw Error('Calibration build changed');
  }
  return {
    app,
    core: coreFile,
    helper: helperFile,
    manifest: { ...manifest, appRecord: record },
    assertUnchanged,
  };
}
module.exports = {
  APP_SOURCE,
  CORE_SOURCE,
  stageArtifacts,
  treeHash,
  treeFiles,
  hash,
  privateDirectory,
};
