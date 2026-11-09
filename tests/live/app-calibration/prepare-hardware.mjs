import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { bundle } from '../../../scripts/bundle.mjs';
import { preserveInstallerHelperModes } from '../../../scripts/installer-modes.mjs';
import { profileArchive } from '../../../scripts/profiles.mjs';
import { run } from '../../../scripts/build.mjs';
const require = createRequire(import.meta.url);
const { stageArtifacts, hash } = require('./artifacts.cjs');

/** Explicit private test distribution; never calls the public packager, changes
 * production records, installs a plugin or launches any App/core. */
export async function prepareHardware(artifactDirectory, calibrationFile) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(artifactDirectory, 'manifest.json')),
  );
  const report = JSON.parse(fs.readFileSync(calibrationFile));
  if (
    report.outcome !== 'passed' ||
    report.cleanup !== true ||
    report.settingsUnchanged !== true ||
    report.productionApproved !== false ||
    report.verifiedFocus !== false ||
    report.builds?.helperSha256 !== manifest.helperSha256 ||
    report.builds?.appTreeSha256 !== manifest.appTreeSha256 ||
    report.scenarios?.requests?.length !== 2 ||
    !report.scenarios.requests.every((request) => request.acknowledged === true)
  )
    throw Error('Hardware calibration required');
  const root = fs.mkdtempSync('/private/tmp/dsh-hw-');
  fs.chmodSync(root, 0o700);
  await stageArtifacts(artifactDirectory, path.join(root, 'artifacts'));
  fs.copyFileSync(
    path.join(artifactDirectory, 'manifest.json'),
    path.join(root, 'artifacts/manifest.json'),
  );
  const name = 'com.kotl3r.deckshep.sdPlugin',
    plugin = path.join(root, name);
  fs.cpSync(path.resolve('dist', name), plugin, {
    recursive: true,
    dereference: false,
  });
  if (
    hash(fs.readFileSync(path.join(plugin, 'bin/herdr-app-peer'))) !==
    manifest.helperSha256
  )
    throw Error('Hardware helper mismatch');
  const configFile = path.join(plugin, 'config.json'),
    config = JSON.parse(fs.readFileSync(configFile));
  config.experimental = { herdrApp: true };
  config.herdrApp = {
    home: path.join(root, 'session/app'),
    coreSocketPath: '',
    readbackEnabled: false,
    focusRequestEnabled: false,
    inputEnabled: false,
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  const metadataFile = path.join(plugin, 'manifest.json'),
    metadata = JSON.parse(fs.readFileSync(metadataFile));
  fs.writeFileSync(
    path.join(plugin, 'profiles/Herdr App.streamDeckProfile'),
    profileArchive(root, 'herdr-app', metadata.Version),
  );
  metadata.Profiles.push({
    Name: 'profiles/Herdr App',
    DeviceType: 0,
    Readonly: false,
    DontAutoSwitchWhenInstalled: true,
    AutoInstall: true,
  });
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2) + '\n');
  const source = path.resolve(
      'tests/live/app-calibration/hardware-backend.cjs',
    ),
    dependencies = path.join(root, 'dependencies.cjs');
  fs.writeFileSync(
    dependencies,
    `const {hardwareBackend}=require(${JSON.stringify(source)});\nexports.applicationDependencies=()=>({experimentalHerdrApp:true,appFocusBackend:hardwareBackend(${JSON.stringify(root)},${JSON.stringify(manifest.appRecord)},${JSON.stringify(manifest.helperSha256)})});\n`,
    { mode: 0o600 },
  );
  try {
    await bundle(
      path.resolve('src/plugin/entry.mts'),
      path.join(plugin, 'bin/plugin.js'),
      { fixture: dependencies, peerHelperSha256: manifest.helperSha256 },
    );
    await bundle(
      path.resolve('tests/live/app-calibration/hardware-entry.cjs'),
      path.join(root, 'launch.cjs'),
      { peerHelperSha256: manifest.helperSha256 },
    );
  } finally {
    fs.rmSync(dependencies, { force: true });
  }
  for (const file of [
    path.join(plugin, 'bin/plugin.js'),
    path.join(root, 'launch.cjs'),
  ]) {
    const bytes = fs.readFileSync(file);
    if (
      bytes.includes(Buffer.from(process.cwd())) ||
      bytes.includes(Buffer.from(process.env.HOME || '\0'))
    )
      throw Error('Hardware path audit failed');
  }
  run(process.execPath, [
    'scripts/tool.mjs',
    '@elgato/cli',
    'validate',
    plugin,
    '--no-update-check',
  ]);
  run(process.execPath, [
    'scripts/tool.mjs',
    '@elgato/cli',
    'pack',
    plugin,
    '--output',
    root,
    '--force',
    '--no-update-check',
    '--no-file-list',
  ]);
  const installerFile = path.join(root, 'com.kotl3r.deckshep.streamDeckPlugin');
  fs.writeFileSync(
    installerFile,
    preserveInstallerHelperModes(fs.readFileSync(installerFile)),
  );
  fs.writeFileSync(
    path.join(root, 'HARDWARE-TEST.json'),
    JSON.stringify(
      {
        schema: 1,
        testOnly: true,
        productionApproved: false,
        verifiedFocus: false,
        helperProtocol: 2,
        helperSha256: manifest.helperSha256,
        manifestSha256: hash(
          fs.readFileSync(path.join(root, 'artifacts/manifest.json')),
        ),
        calibrationSha256: hash(fs.readFileSync(calibrationFile)),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  for (const relative of [
    'scripts/migrate-upgrade.mjs',
    'scripts/install.mjs',
    'scripts/archive.mjs',
    'scripts/profiles.mjs',
    'docs/INSTALL.md',
    'docs/IDENTITY.md',
    'docs/HERDR-APP-HARDWARE-TEST.md',
  ]) {
    fs.mkdirSync(path.join(root, path.dirname(relative)), {
      recursive: true,
      mode: 0o700,
    });
    fs.copyFileSync(relative, path.join(root, relative));
  }
  const guide = fs
    .readFileSync('docs/HERDR-APP-HARDWARE-TEST.md', 'utf8')
    .replaceAll('<test-folder>', root)
    .replace('(INSTALL.md#', '(docs/INSTALL.md#');
  fs.writeFileSync(path.join(root, 'README.md'), guide, { mode: 0o600 });
  return root;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = await prepareHardware(process.argv[2], process.argv[3]);
  console.log('Private hardware test prepared: ' + root);
}
