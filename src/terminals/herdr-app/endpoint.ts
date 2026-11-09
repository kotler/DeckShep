import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
export interface SocketPolicy {
  /** herdr-core creates its socket 0755 inside an owner-only folder. Owner
   * approval 2026-11-08: for the core only, an owned 0700 parent is enough,
   * because connecting needs search access to that folder. App sockets stay
   * strict: a recreated App socket with broader mode must still refuse. */
  ownerOnlyParentSuffices?: boolean;
}
/** Reject links in every component, not just the socket or its immediate parent.
 * Keep filesystem errors private: their messages contain the selected home. */
export function inspectSocket(
  value: string,
  policy: SocketPolicy = {},
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
    const directory = fs.lstatSync(path.dirname(file)),
      socket = fs.lstatSync(file);
    if (
      !directory.isDirectory() ||
      directory.uid !== uid ||
      directory.mode & 0o077 ||
      !socket.isSocket() ||
      socket.uid !== uid ||
      (!policy.ownerOnlyParentSuffices && socket.mode & 0o077) ||
      // Even with an owner-only parent, a group/world-writable socket refuses.
      socket.mode & 0o022
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
