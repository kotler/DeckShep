import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { exec } from '../../platform/exec';
import { trustedApplicationsAncestor } from '../../platform/applications-ancestor';

export type PlistDecoder = (bytes: Buffer) => Promise<unknown>;
async function decodePlist(bytes: Buffer): Promise<unknown> {
  return JSON.parse(
    await exec('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], {
      input: bytes,
      timeout: 500,
      maxBuffer: 65536,
      message: 'Build mismatch',
    }),
  );
}
function stamp(stat: fs.BigIntStats): string {
  return [
    stat.dev,
    stat.ino,
    stat.uid,
    stat.mode,
    stat.gid,
    stat.nlink,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].join(':');
}
function trustedOwner(stat: fs.BigIntStats): boolean {
  return stat.uid === 0n || stat.uid === BigInt(process.getuid!());
}
function track(file: string, files: Map<string, string>): void {
  const stat = fs.lstatSync(file, { bigint: true });
  if (stat.isSymbolicLink() || !trustedOwner(stat)) throw Error();
  // A shared sticky ancestor is acceptable; files and bundle directories aren't.
  const inBundle = file
    .split(path.sep)
    .some((component) => component.endsWith('.app'));
  if (
    stat.mode & 0o022n &&
    !(stat.isDirectory() && stat.mode & 0o1000n && !inBundle) &&
    !trustedApplicationsAncestor(file, stat)
  )
    throw Error();
  files.set(file, stamp(stat));
}
function ancestors(file: string, files: Map<string, string>): void {
  if (
    !path.isAbsolute(file) ||
    path.normalize(file) !== file ||
    /[\x00-\x1f\x7f]/.test(file) ||
    file.length > 1024
  )
    throw Error();
  let current = path.parse(file).root;
  // Ancestor timestamps change for unrelated activity; retain their ownership,
  // mode and inode only. Leaf bytes and metadata are checked separately.
  for (const piece of file.slice(current.length).split(path.sep).slice(0, -1)) {
    current = path.join(current, piece);
    track(current, files);
    if (!fs.lstatSync(current).isDirectory()) throw Error();
  }
}
function readFile(
  file: string,
  limit: number,
  files: Map<string, string>,
): Buffer {
  ancestors(file, files);
  track(file, files);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    if (
      !stat.isFile() ||
      stat.nlink !== 1n ||
      stat.size < 1n ||
      stat.size > BigInt(limit) ||
      stamp(stat) !== files.get(file)
    )
      throw Error();
    const bytes = Buffer.alloc(Number(stat.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (!count) throw Error();
      offset += count;
    }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, null)) throw Error();
    if (
      bytes.length !== Number(stat.size) ||
      stamp(fs.fstatSync(fd, { bigint: true })) !== stamp(stat)
    )
      throw Error();
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}
function unchanged(files: Map<string, string>): void {
  try {
    for (const [file, expected] of files) {
      const stat = fs.lstatSync(file, { bigint: true });
      const actual = stamp(stat);
      // Directory contents may change, but replacing an ancestor is refused.
      const stable = (value: string) => value.split(':').slice(0, 5).join(':');
      if (
        stat.isSymbolicLink() ||
        // The exception's ACL is checked at capture. Its ctime must remain
        // stable too, so ACL edits or container replacement invalidate a press.
        (stat.isDirectory() && file !== '/Applications'
          ? stable(actual) !== stable(expected)
          : actual !== expected)
      )
        throw Error();
    }
  } catch {
    throw Error('Build mismatch');
  }
}
/** Reads only the selected bundle's executable/plist, never executes that app. */
export async function inspectAppBuild(
  executable: string,
  decoder: PlistDecoder = decodePlist,
) {
  try {
    if (!executable.endsWith('/Contents/MacOS/Herdr')) throw Error();
    const bundle = path.dirname(path.dirname(path.dirname(executable)));
    if (!bundle.endsWith('.app')) throw Error();
    const files = new Map<string, string>(),
      binary = readFile(executable, 256 * 1024 * 1024, files),
      plist = readFile(path.join(bundle, 'Contents/Info.plist'), 65536, files),
      metadata = (await decoder(plist)) as Record<string, unknown>;
    if (
      !metadata ||
      metadata.CFBundleIdentifier !== 'dev.herdr.app' ||
      metadata.CFBundleExecutable !== 'Herdr' ||
      ![metadata.CFBundleVersion, metadata.CFBundleShortVersionString].every(
        (value) =>
          typeof value === 'string' && /^[^\x00-\x1f\x7f]{1,1024}$/.test(value),
      )
    )
      throw Error();
    unchanged(files);
    return {
      bundleId: 'dev.herdr.app' as const,
      executable: 'Herdr' as const,
      version: metadata.CFBundleShortVersionString,
      build: metadata.CFBundleVersion,
      executableSha256: createHash('sha256').update(binary).digest('hex'),
      plistSha256: createHash('sha256').update(plist).digest('hex'),
      assertUnchanged: () => unchanged(files),
    };
  } catch {
    throw Error('Build mismatch');
  }
}
