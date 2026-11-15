import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checked } from './process.mjs';

const policyName = '.source-privacy.json';
const account = /^[A-Za-z0-9_.-]+$/;
function policy(bytes) {
  if (!bytes) return [];
  const value = JSON.parse(bytes);
  if (!Array.isArray(value)) throw Error('Invalid source privacy exceptions');
  const seen = new Set();
  for (const item of value) {
    if (
      !item ||
      Object.keys(item).sort().join(',') !== 'account,file,reason,root' ||
      typeof item.file !== 'string' ||
      path.isAbsolute(item.file) ||
      item.file
        .split('/')
        .some((part) => !part || part === '..' || part === '.') ||
      !['Users', 'home'].includes(item.root) ||
      typeof item.account !== 'string' ||
      !account.test(item.account) ||
      typeof item.reason !== 'string' ||
      !item.reason.trim() ||
      item.reason.length > 160
    )
      throw Error('Invalid source privacy exceptions');
    const key = JSON.stringify([item.file, item.root, item.account]);
    if (seen.has(key)) throw Error('Duplicate source privacy exception');
    seen.add(key);
  }
  return value;
}

/** Literal home roots and this checkout's absolute path. Exceptions apply to
 * one synthetic account in one file, never a directory or all tests. */
export function privatePathLines(text, { file, root, home, exceptions = [] }) {
  const approved = new Set(
    exceptions
      .filter((item) => item.file === file)
      .map((item) => '/' + item.root + '/' + item.account),
  );
  const homeRoots =
    /(?<![\w.-])\/(?:Users|home)\/[A-Za-z0-9_.-]+(?![A-Za-z0-9_.-])/g;
  const windowsRoots =
    /\b[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9_.-]+(?![A-Za-z0-9_.-])/g;
  return text.split('\n').flatMap((line, index) => {
    const normalized = line.replaceAll('\\/', '/');
    const roots = [...normalized.matchAll(homeRoots)].map((match) => match[0]);
    const privateRoot = roots.some((value) => !approved.has(value));
    const privateLocal =
      (root && root !== path.parse(root).root && normalized.includes(root)) ||
      (home &&
        home !== path.parse(home).root &&
        normalized.includes(home) &&
        !approved.has(home));
    return privateRoot ||
      privateLocal ||
      [...line.matchAll(windowsRoots)].length
      ? [index + 1]
      : [];
  });
}

export function scanSource({
  root = process.cwd(),
  staged = false,
  home = os.homedir(),
} = {}) {
  const git = (args) =>
    checked('git', args, {
      cwd: root,
      capture: true,
      message: 'Source privacy Git input unavailable',
    });
  root = git(['rev-parse', '--show-toplevel']).trim();
  const tracked = () => git(['ls-files', '-z']).split('\0').filter(Boolean);
  const changed = staged
    ? git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean)
    : [];
  let files = staged
    ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
        .split('\0')
        .filter(Boolean)
    : tracked();
  const read = (file) =>
    staged
      ? checked('git', ['show', ':' + file], {
          cwd: root,
          capture: true,
          encoding: null,
          message: 'Source privacy Git input unavailable',
        })
      : fs.lstatSync(path.join(root, file)).isSymbolicLink()
        ? Buffer.from(fs.readlinkSync(path.join(root, file)))
        : fs.readFileSync(path.join(root, file));
  const policyExists = staged
    ? tracked().includes(policyName)
    : fs.existsSync(path.join(root, policyName));
  const exceptions = policy(policyExists ? read(policyName) : null);
  // A policy edit must recheck the whole index, including newly unexempted files.
  if (staged && changed.includes(policyName)) files = tracked();
  const findings = [];
  for (const file of files) {
    const bytes = read(file);
    if (bytes.includes(0)) continue;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      continue;
    }
    for (const line of privatePathLines(text, { file, root, home, exceptions }))
      findings.push({ file, line });
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--staged'))
      throw Error('Use --staged or no arguments');
    const findings = scanSource({ staged: process.argv.includes('--staged') });
    if (findings.length) {
      // Report locations, never the matched path or source line.
      for (const finding of findings)
        process.stderr.write(
          JSON.stringify(finding) + ': private home/workspace path\n',
        );
      process.exitCode = 1;
    } else console.log('Source privacy check passed');
  } catch {
    console.error(
      'Source privacy check failed; repository input unavailable or invalid',
    );
    process.exitCode = 1;
  }
}
