import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { bundle } from '../../../scripts/bundle.mjs';
import { profileArchive } from '../../../scripts/profiles.mjs';
import { preserveInstallerHelperModes } from '../../../scripts/installer-modes.mjs';
import { run } from '../../../scripts/build.mjs';
const require = createRequire(import.meta.url);
const { stageRelease } = require('./release-stage.cjs');
const { reviewReleasePreview } = require('./release-approval.cjs');
const { hash } = require('./artifacts.cjs');

export async function prepareReleasePreview(
  artifactDirectory,
  calibrationFile,
  ownerApproved = false,
) {
  const candidate = JSON.parse(
    fs.readFileSync(path.join(artifactDirectory, 'release-candidate.json')),
  );
  const calibration = JSON.parse(fs.readFileSync(calibrationFile));
  const record = reviewReleasePreview(candidate, calibration, ownerApproved);
  const root = fs.mkdtempSync('/private/tmp/dsh-release-preview-');
  fs.chmodSync(root, 0o700);
  const staged = await stageRelease(
    artifactDirectory,
    path.join(root, 'validated-artifacts'),
  );
  staged.verifyTrees();
  const name = 'com.kotl3r.deckshep.sdPlugin',
    plugin = path.join(root, name);
  fs.cpSync(path.resolve('dist', name), plugin, {
    recursive: true,
    dereference: false,
  });
  const inspectorFile = path.join(plugin, 'inspector.html');
  const inspector = fs.readFileSync(inspectorFile, 'utf8');
  const unapprovedNote = /No App build is\s+approved in this preview\./;
  if (!unapprovedNote.test(inspector)) throw Error('Preview inspector changed');
  fs.writeFileSync(
    inspectorFile,
    inspector.replace(
      unapprovedNote,
      'Only the exact reviewed App build is available in this private preview.',
    ),
  );
  const helperSha256 = candidate.helper.sha256;
  if (
    hash(fs.readFileSync(path.join(plugin, 'bin/herdr-app-peer'))) !==
    helperSha256
  )
    throw Error('Preview helper mismatch');
  const configFile = path.join(plugin, 'config.json'),
    config = JSON.parse(fs.readFileSync(configFile));
  config.experimental = { herdrApp: true };
  config.herdrApp = {
    home: '',
    coreSocketPath: '',
    readbackEnabled: false,
    focusRequestEnabled: false,
    inputEnabled: false,
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  const manifestFile = path.join(plugin, 'manifest.json'),
    manifest = JSON.parse(fs.readFileSync(manifestFile));
  fs.writeFileSync(
    path.join(plugin, 'profiles/Herdr App.streamDeckProfile'),
    profileArchive(root, 'herdr-app', manifest.Version),
  );
  manifest.Profiles.push({
    Name: 'profiles/Herdr App',
    DeviceType: 0,
    Readonly: false,
    DontAutoSwitchWhenInstalled: true,
    AutoInstall: true,
  });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  const dependencies = path.join(root, 'dependencies.cjs');
  fs.writeFileSync(
    dependencies,
    `const {releasePreviewBackend}=require(${JSON.stringify(path.resolve('tests/live/app-calibration/release-preview-backend.cjs'))});\nexports.applicationDependencies=()=>({experimentalHerdrApp:true,appFocusBackend:releasePreviewBackend(${JSON.stringify(record)},${JSON.stringify(helperSha256)})});\n`,
    { mode: 0o600 },
  );
  try {
    await bundle(
      path.resolve('src/plugin/entry.mts'),
      path.join(plugin, 'bin/plugin.js'),
      { fixture: dependencies, peerHelperSha256: helperSha256 },
    );
  } finally {
    fs.rmSync(dependencies, { force: true });
  }
  const bytes = fs.readFileSync(path.join(plugin, 'bin/plugin.js'));
  if (
    bytes.includes(Buffer.from(process.cwd())) ||
    bytes.includes(Buffer.from(process.env.HOME || '\0'))
  )
    throw Error('Preview path audit failed');
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
  const installer = path.join(root, 'com.kotl3r.deckshep.streamDeckPlugin');
  fs.writeFileSync(
    installer,
    preserveInstallerHelperModes(fs.readFileSync(installer)),
  );
  fs.writeFileSync(
    path.join(root, 'PREVIEW.json'),
    JSON.stringify(
      {
        schema: 1,
        privatePreview: true,
        productionApproved: false,
        verifiedFocus: false,
        expiresAt: null,
        record,
        helperSha256,
        pluginSha256: hash(bytes),
        calibrationSha256: hash(fs.readFileSync(calibrationFile)),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  return root;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = await prepareReleasePreview(
    process.argv[2],
    process.argv[3],
    process.argv[4] === '--owner-approved',
  );
  console.log('Private release preview prepared: ' + root);
}
