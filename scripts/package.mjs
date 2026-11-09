import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { releasePolicy } from './release-policy.mjs';
import { preserveInstallerHelperModes } from './installer-modes.mjs';
import { zip, tree, readRegular } from './archive.mjs';
import { releaseReadinessFailures } from './release-readiness.mjs';
import {
  root,
  PAYLOAD,
  PROFILES,
  INSTALLER,
  digest,
  verifyBundle,
} from './audit.mjs';
const args = process.argv.slice(2),
  option = (name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
if (option('--verify')) {
  verifyBundle(fs.readFileSync(option('--verify')));
  console.log('Bundle verified');
} else {
  const version = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json')),
  ).version;
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw Error('Git provenance unavailable');
    return result.stdout.trim();
  };
  const revision = git(['rev-parse', 'HEAD']),
    dirty = !!git(['status', '--porcelain', '--untracked-files=normal']);
  const policy = releasePolicy(version, {
    tag: option('--tag'),
    release: args.includes('--release'),
    dirty,
  });
  const { tag } = policy;
  if (args.includes('--release')) {
    const failures = releaseReadinessFailures();
    if (failures.length)
      throw Error('Release distribution blocked: ' + failures.join('; '));
  }
  if (args.includes('--require-clean') && dirty)
    throw Error('Commit or remove source changes before a release build');
  const { build, run } = await import('./build.mjs');
  const plugin = args.includes('--skip-build')
    ? path.join(root, 'dist/com.kotl3r.deckshep.sdPlugin')
    : await build({ universal: true });
  tree(plugin);
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
    path.join(root, 'dist'),
    '--force',
    '--no-update-check',
    '--no-file-list',
  ]);
  for (const architecture of ['arm64', 'x86_64'])
    for (const helper of ['visible-pane', 'herdr-app-peer'])
      run('lipo', [
        path.join(plugin, 'bin', helper),
        '-verify_arch',
        architecture,
      ]);
  const installerFile = path.join(root, 'dist', INSTALLER);
  fs.writeFileSync(
    installerFile,
    preserveInstallerHelperModes(fs.readFileSync(installerFile)),
  );
  const out = path.join(root, 'dist'),
    info = {
      ...policy,
      packageVersion: version,
      pluginVersion: version + '.0',
      gitCommit: revision,
      workingTreeDirty: dirty,
      helperArchitectures: ['arm64', 'x86_64'],
    };
  fs.writeFileSync(
    path.join(out, 'BUILD-INFO.json'),
    JSON.stringify(info, null, 2) + '\n',
  );
  const files = new Map(
    [...PAYLOAD]
      .sort()
      .map((name) => [
        name,
        readRegular(
          path.join(
            [INSTALLER, ...PROFILES, 'BUILD-INFO.json'].includes(name)
              ? out
              : root,
            name,
          ),
        ),
      ]),
  );
  const checksums = [...files]
    .map(([name, data]) => digest(data) + '  ' + name + '\n')
    .join('');
  files.set('SHA256SUMS', Buffer.from(checksums));
  const archive = zip(files);
  verifyBundle(archive);
  const name = `deckshep-${tag.slice(1)}-macos.zip`;
  fs.writeFileSync(path.join(out, name), archive);
  fs.writeFileSync(
    path.join(out, name + '.sha256'),
    digest(archive) + '  ' + name + '\n',
  );
  fs.writeFileSync(path.join(out, 'SHA256SUMS'), checksums);
  console.log(
    'Built and audited ' + policy.distribution + ' bundle. Nothing uploaded.',
  );
}
