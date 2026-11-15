import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export interface AppHomeOptions {
  appHome?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
}
function absolute(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !path.isAbsolute(value) ||
    /[\x00-\x1f\x7f]/.test(value) ||
    value.length > 1024
  )
    throw Error('Invalid Herdr App endpoint');
  return path.normalize(value);
}
/** Resolution never launches the App or probes the default socket. */
export function appSocket(options: AppHomeOptions = {}): string {
  const env = options.env ?? process.env;
  const home = options.appHome ?? env.HERDR_APP_HOME;
  const directory =
    home !== undefined
      ? absolute(home)
      : path.join(
          absolute(
            env.XDG_CONFIG_HOME ??
              path.join(options.home ?? os.homedir(), '.config'),
          ),
          'herdr-app',
        );
  return path.join(directory, 'herdr-app.sock');
}
export interface SocketEndpoint {
  file: string;
  identity: string;
}
// macOS ACLs can grant search access even when the directory mode is 0700.
// Cache only a successful check. ACL edits change ctime and replacement
// changes the inode, so ordinary roster polls need no additional process.
let checkedAppDirectory = '';
function privateAppDirectory(file: string, directory: fs.BigIntStats): boolean {
  if ((directory.mode & 0o7777n) !== 0o700n) return false;
  if (process.platform !== 'darwin') return true;
  const identity = [directory.dev, directory.ino, directory.ctimeNs].join(':');
  if (checkedAppDirectory === identity) return true;
  const listing = execFileSync('/bin/ls', ['-lde', file], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { LC_ALL: 'C' },
    timeout: 250,
    maxBuffer: 8192,
  }).trimEnd();
  if (!/^drwx------[@ ]/.test(listing) || listing.includes('\n')) return false;
  checkedAppDirectory = identity;
  return true;
}
/** Reject links in every component, not just the socket or its immediate parent.
 * Keep filesystem errors private: their messages contain the selected home. */
export function inspectSocket(
  value: string,
  policy: 'private' | 'app' | 'core' = 'private',
): SocketEndpoint {
  try {
    const file = absolute(value),
      uid = process.getuid?.();
    if (uid === undefined) throw Error();
    let current = path.parse(file).root;
    for (const component of file.slice(current.length).split(path.sep)) {
      current = path.join(current, component);
      if (fs.lstatSync(current).isSymbolicLink()) throw Error();
    }
    const parent = path.dirname(file),
      directory = fs.lstatSync(parent, { bigint: true }),
      socket = fs.lstatSync(file);
    if (
      !directory.isDirectory() ||
      directory.uid !== BigInt(uid) ||
      directory.mode & 0o077n ||
      !socket.isSocket() ||
      socket.uid !== uid ||
      socket.mode & 0o022 ||
      // ADR 0008: the private App home protects every socket mode, including
      // 0600 sockets. POSIX mode alone does not account for macOS ACL grants.
      (policy === 'app' &&
        (socket.nlink !== 1 || !privateAppDirectory(parent, directory))) ||
      (socket.mode & 0o077 &&
        policy !== 'core' &&
        !(policy === 'app' && (socket.mode & 0o7777) === 0o755))
    )
      throw Error();
    return {
      file,
      identity: [directory.dev, directory.ino, socket.dev, socket.ino].join(
        ':',
      ),
    };
  } catch {
    throw Error('Unsafe or unavailable Herdr App endpoint');
  }
}
