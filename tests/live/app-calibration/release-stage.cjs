const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { hash, privateDirectory, readArtifact } = require('./artifacts.cjs');
const {
  prepareReleaseCandidate,
  bundleFiles,
  inventory,
} = require('./release-artifacts.cjs');
const { validate } = require('../../../src/schemas');

/** Separate release loader: a source manifest cannot select it. Re-attest whole
 * signed bundles and match the reviewed report before creating any authority. */
async function stageRelease(directory, destination, effects = {}) {
  privateDirectory(directory);
  const expected = JSON.parse(
    readArtifact(path.join(directory, 'release-candidate.json'), 65536),
  );
  const report = await prepareReleaseCandidate(
    {
      appBundle: path.join(directory, 'Herdr.app'),
      coreBundle: path.join(directory, 'Herdr Core.app'),
      helper: path.join(directory, 'herdr-app-peer'),
      destination,
    },
    effects,
  );
  if (
    !isDeepStrictEqual(report, expected) ||
    report.app.version !== '0.1.14' ||
    report.core.version !== '0.1.19'
  )
    throw Error('Release candidate changed');
  const app = path.join(destination, 'Herdr.app/Contents/MacOS/Herdr');
  const core = path.join(
    destination,
    'Herdr Core.app/Contents/MacOS/herdr-core',
  );
  const helper = path.join(destination, 'herdr-app-peer');
  const appRecord = validate('herdrAppFocusRecord', {
    contract: 1,
    key: 'herdr-app-release-0.1.14-request-only',
    bundleId: report.app.bundleId,
    executable: 'Herdr',
    version: report.app.version,
    build: report.app.build,
    executableSha256: report.app.executableSha256,
    plistSha256: report.app.plistSha256,
    cdHash: report.app.signature.cdHash,
  });
  const tracked = [];
  function stamp(file) {
    const stat = fs.lstatSync(file, { bigint: true });
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
  for (const name of ['Herdr.app', 'Herdr Core.app'])
    for (const file of bundleFiles(path.join(destination, name)).keys()) {
      const full = path.join(destination, name, file);
      tracked.push([full, stamp(full)]);
    }
  tracked.push([helper, stamp(helper)]);
  function assertUnchanged() {
    for (const [file, before] of tracked)
      if (stamp(file) !== before) throw Error('Release build changed');
  }
  function verifyTrees() {
    for (const [name, value] of [
      ['Herdr.app', report.app],
      ['Herdr Core.app', report.core],
    ])
      if (
        hash(
          JSON.stringify(inventory(bundleFiles(path.join(destination, name)))),
        ) !== value.treeSha256
      )
        throw Error('Release build changed');
    if (hash(fs.readFileSync(helper)) !== report.helper.sha256)
      throw Error('Release helper changed');
  }
  return {
    app,
    core,
    helper,
    assertUnchanged,
    verifyTrees,
    manifest: {
      appSource: '2405bf388c568c3ed479f05b8e405ccfa44b3f2c',
      coreSource: '06793ede1bedb1fed8d22d3cae476d3eb239edf0',
      appRecord,
      appTreeSha256: report.app.treeSha256,
      core: {
        version: report.core.version,
        sha256: report.core.executableSha256,
        cdHash: report.core.signature.cdHash,
      },
      coreTreeSha256: report.core.treeSha256,
      helperSha256: report.helper.sha256,
    },
  };
}
module.exports = { stageRelease };
