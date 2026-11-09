import type { BigIntStats } from 'node:fs';
import { execFileSync } from 'node:child_process';

type DirectoryIdentity = Pick<
  BigIntStats,
  'uid' | 'gid' | 'mode' | 'isDirectory'
>;

function applicationsAcl(): string {
  return execFileSync('/bin/ls', ['-lde', '/Applications'], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 250,
    maxBuffer: 8192,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
  });
}
/** Owner-approved macOS installation exception, 2026-11-08. This permits only
 * the system container; bundle files/directories retain the shared-write ban.
 * Admin-only container replacement still requires the exact signed peer/image,
 * executable/plist hashes and stable metadata around every request. */
export function trustedApplicationsAncestor(
  file: string,
  stat: DirectoryIdentity,
  platform = process.platform,
  readAcl: () => string = applicationsAcl,
): boolean {
  if (
    platform !== 'darwin' ||
    file !== '/Applications' ||
    !stat.isDirectory() ||
    stat.uid !== 0n ||
    stat.gid !== 80n ||
    (stat.mode & 0o7777n) !== 0o775n
  )
    return false;
  try {
    const lines = readAcl().trimEnd().split('\n');
    // The standard ACL only denies deletion. Never accept positive ACL grants,
    // unknown entries or truncated output as evidence of admin-only writing.
    return (
      /^d[rwx-]{9}[+ ]/.test(lines[0]) &&
      lines.length <= 2 &&
      (lines.length === 1
        ? !lines[0].startsWith('drwxrwxr-x+')
        : lines[1].trim() === '0: group:everyone deny delete')
    );
  } catch {
    return false;
  }
}
