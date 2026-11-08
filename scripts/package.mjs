import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, root, run } from './build.mjs';
import { zip } from './archive.mjs';
import {
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
    ).version,
    tag = option('--tag') || `v${version}-beta.1`;
  if (
    !new RegExp(
      '^v' + version.replaceAll('.', '\\.') + '-beta\\.[1-9][0-9]*$',
    ).test(tag)
  )
    throw Error('Tag must match package version: v' + version + '-beta.N');
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw Error('Git provenance unavailable');
    return result.stdout.trim();
  };
  const revision = git(['rev-parse', 'HEAD']),
    dirty = !!git(['status', '--porcelain', '--untracked-files=normal']);
  if (args.includes('--require-clean') && dirty)
    throw Error('Commit or remove source changes before a release build');
  const plugin = args.includes('--skip-build')
    ? path.join(root, 'dist/com.local.rexagents.sdPlugin')
    : await build({ universal: true });
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
  run('lipo', [
    '-verify_arch',
    'arm64',
    'x86_64',
    path.join(plugin, 'bin/visible-pane'),
  ]);
  const out = path.join(root, 'dist'),
    info = {
      tag,
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
        fs.readFileSync(
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
  const name = `agent-switchboard-${tag.slice(1)}-macos.zip`;
  fs.writeFileSync(path.join(out, name), archive);
  fs.writeFileSync(
    path.join(out, name + '.sha256'),
    digest(archive) + '  ' + name + '\n',
  );
  fs.writeFileSync(path.join(out, 'SHA256SUMS'), checksums);
  console.log('Built and audited beta bundle. Nothing uploaded.');
}
