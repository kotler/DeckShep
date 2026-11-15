import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checked, CommandFailure } from './process.mjs';
import { unzip, readRegular } from './archive.mjs';
import { verifyBundle, digest, INSTALLER, PLUGIN } from './audit.mjs';
import { helperNames, verifyNativeHelpers } from './native-helpers.mjs';
import { releasePolicy } from './release-policy.mjs';
import { releaseReadinessFailures } from './release-readiness.mjs';

export function verifyRelease(
  file,
  { tag, commit, release = false, sha256, run = checked } = {},
) {
  if (
    !/^v\d+\.\d+\.\d+(?:-beta\.[1-9][0-9]*)?$/.test(tag || '') ||
    !/^[a-f0-9]{40}$/.test(commit || '') ||
    (sha256 !== undefined && !/^[a-f0-9]{64}$/.test(sha256))
  )
    throw Error('Verification requires an exact tag and full commit');
  const name = `deckshep-${tag.slice(1)}-macos.zip`;
  if (path.basename(file) !== name)
    throw Error('Archive filename must match tag');
  const bytes = readRegular(file),
    hash = digest(bytes);
  const checksum = readRegular(file + '.sha256').toString();
  if (checksum !== hash + '  ' + name + '\n' || (sha256 && sha256 !== hash))
    throw Error('Outer archive checksum mismatch');
  const info = verifyBundle(bytes);
  if (
    info.tag !== tag ||
    info.gitCommit !== commit ||
    info.workingTreeDirty !== false ||
    info.distribution !== (release ? 'public-release' : 'private-review') ||
    JSON.stringify(info.helperArchitectures) !==
      JSON.stringify(['arm64', 'x86_64'])
  )
    throw Error('Archive does not match expected clean source provenance');
  const payload = unzip(bytes),
    installer = unzip(payload.get(INSTALLER));
  const prefix = PLUGIN + '/bin/';
  const peerHash = digest(installer.get(prefix + 'herdr-app-peer'));
  if (!installer.get(prefix + 'plugin.js').includes(Buffer.from(peerHash)))
    throw Error('Packaged peer helper does not match the bundle pin');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-verify-'));
  try {
    for (const name of helperNames)
      fs.writeFileSync(
        path.join(directory, name),
        installer.get(prefix + name),
        { mode: 0o700 },
      );
    verifyNativeHelpers(directory, run);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return {
    schemaVersion: 1,
    artifact: name,
    sha256: hash,
    tag,
    gitCommit: commit,
    distribution: info.distribution,
    workingTreeDirty: false,
    checks: [
      'outer-checksum',
      'bundle-audit',
      'provenance',
      'helper-modes',
      'universal-slices',
      'signatures',
      'peer-pin',
    ],
  };
}

export const preparationChecks = [
  'privacy:source',
  'lint',
  'format:check',
  'typecheck',
  'deps',
  'knip',
  'version:check',
  'compatibility:check',
  'marketplace:media',
  'marketplace:check',
  'test:coverage',
  'test:bundled',
  'test:e2e',
];

/** Build committed source in an owned checkout. No tag, upload, install or live test. */
export function prepareRelease({
  root = process.cwd(),
  tag,
  release = false,
  run = checked,
  verify = verifyRelease,
} = {}) {
  root = fs.realpathSync(root);
  const git = (args) =>
    run('git', args, {
      cwd: root,
      capture: true,
      message: 'Release source inspection failed',
    }).trim();
  const commit = git(['rev-parse', 'HEAD']);
  if (
    !/^[a-f0-9]{40}$/.test(commit) ||
    git(['status', '--porcelain', '--untracked-files=no'])
  )
    throw Error('Release preparation requires committed, clean tracked source');
  const version = JSON.parse(
    readRegular(path.join(root, 'package.json')),
  ).version;
  releasePolicy(version, { tag, release });
  if (!tag) throw Error('An explicit release tag is required');
  if (release && releaseReadinessFailures(root).length)
    throw Error('Approved release evidence is required');
  // Keep the output confined to dist, rejecting symlink ancestors and existing candidates.
  let target = root;
  for (const part of ['dist', 'release-candidates']) {
    target = path.join(target, part);
    if (!fs.existsSync(target)) fs.mkdirSync(target);
    if (
      fs.lstatSync(target).isSymbolicLink() ||
      !fs.lstatSync(target).isDirectory()
    )
      throw Error('Unsafe release output directory');
  }
  const output = path.join(target, tag);
  if (fs.existsSync(output)) throw Error('Release candidate already exists');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-prepare-'));
  const checkout = path.join(temporary, 'source'),
    candidate = path.join(temporary, 'candidate');
  // CI is deliberately set: authorization() refuses live tests even if flags were inherited.
  const options = { cwd: checkout, env: { ...process.env, CI: 'true' } };
  let added = false,
    failure,
    receipt;
  try {
    run('git', ['worktree', 'add', '--detach', checkout, commit], {
      cwd: root,
      capture: true,
      message: 'Could not create release checkout',
    });
    added = true;
    run('npm', ['ci'], {
      ...options,
      message: 'Release dependency installation failed',
    });
    if (release)
      run('npm', ['run', 'release:check'], {
        ...options,
        message: 'Release readiness failed',
      });
    for (const check of preparationChecks)
      run('npm', ['run', check], {
        ...options,
        message: 'Release check failed: ' + check,
      });
    run('npm', ['audit', '--audit-level=high'], {
      ...options,
      message: 'Release dependency audit failed',
    });
    run('npm', ['run', 'build', '--', '--universal'], {
      ...options,
      message: 'Universal release build failed',
    });
    run(
      'npm',
      [
        'run',
        'package',
        '--',
        '--skip-build',
        '--require-clean',
        '--tag',
        tag,
        ...(release ? ['--release'] : []),
      ],
      { ...options, message: 'Release packaging failed' },
    );
    const name = `deckshep-${tag.slice(1)}-macos.zip`;
    receipt = verify(path.join(checkout, 'dist', name), {
      tag,
      commit,
      release,
      run,
    });
    receipt.preparationChecks = [
      ...preparationChecks,
      'npm-ci',
      'npm-audit',
      'universal-build',
      'package',
    ];
    fs.mkdirSync(candidate);
    for (const name of [
      receipt.artifact,
      receipt.artifact + '.sha256',
      'SHA256SUMS',
    ])
      fs.writeFileSync(
        path.join(candidate, name),
        readRegular(path.join(checkout, 'dist', name)),
      );
    fs.writeFileSync(
      path.join(candidate, 'verification.json'),
      JSON.stringify(receipt, null, 2) + '\n',
    );
  } catch (error) {
    failure = error;
  }
  try {
    if (added)
      run('git', ['worktree', 'remove', '--force', checkout], {
        cwd: root,
        capture: true,
        message: 'Release checkout cleanup failed',
      });
  } catch (error) {
    failure ||= error;
  }
  if (failure) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw failure;
  }
  let claimed = false;
  try {
    // mkdir is exclusive, so a concurrent invocation cannot be overwritten.
    fs.mkdirSync(output);
    claimed = true;
    for (const name of fs.readdirSync(candidate))
      fs.copyFileSync(
        path.join(candidate, name),
        path.join(output, name),
        fs.constants.COPYFILE_EXCL,
      );
  } catch (error) {
    if (claimed) fs.rmSync(output, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return { output: path.relative(root, output), ...receipt };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [mode, ...args] = process.argv.slice(2),
      options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--release') options.release = true;
      else if (
        (mode === 'verify'
          ? ['--tag', '--commit', '--sha256']
          : ['--tag']
        ).includes(args[i]) &&
        args[i + 1] &&
        !args[i + 1].startsWith('--')
      )
        options[args[i].slice(2)] = args[++i];
      else if (mode === 'verify' && !options.file && !args[i].startsWith('--'))
        options.file = args[i];
      else throw Error('Invalid release options');
    }
    const result =
      mode === 'prepare'
        ? prepareRelease(options)
        : mode === 'verify'
          ? verifyRelease(options.file, options)
          : null;
    if (!result) throw Error('Use prepare or verify');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      error instanceof CommandFailure
        ? error.message + '; no successful verification receipt'
        : 'Release operation failed; no successful verification receipt. Check tag, clean source, release evidence and archive inputs.',
    );
    process.exitCode = 1;
  }
}
