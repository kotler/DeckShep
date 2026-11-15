import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checked } from './process.mjs';

/** Explicit, repository-local setup. Preserve any existing custom hooks. */
export function installHooks(root = process.cwd()) {
  const options = { cwd: root, encoding: 'utf8', stdio: 'pipe', shell: false };
  const current = spawnSync(
    'git',
    ['config', '--get', 'core.hooksPath'],
    options,
  );
  if (current.error || ![0, 1].includes(current.status))
    throw Error('Git hook configuration unavailable');
  const hook = fs.lstatSync(path.join(root, '.githooks/pre-commit'));
  if (!hook.isFile() || hook.isSymbolicLink() || !(hook.mode & 0o111))
    throw Error('Versioned privacy hook unavailable');
  const selected = current.stdout.trim();
  if (selected === '.githooks') return;
  if (selected)
    throw Error('Existing custom hooks must be integrated manually');
  const prior = checked(
    'git',
    ['rev-parse', '--git-path', 'hooks/pre-commit'],
    {
      cwd: root,
      capture: true,
      message: 'Git hooks unavailable',
    },
  ).trim();
  if (fs.existsSync(path.resolve(root, prior)))
    throw Error('Existing pre-commit hook must be preserved');
  checked('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
    cwd: root,
    message: 'Could not configure repository privacy hook',
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    installHooks();
    console.log('Repository privacy hook installed');
  } catch {
    console.error(
      'Privacy hook setup refused; preserve existing hooks and check the versioned hook',
    );
    process.exitCode = 1;
  }
}
