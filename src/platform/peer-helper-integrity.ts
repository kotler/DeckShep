import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

/** Pin reviewed bytes, never bless a hash obtained from an arbitrary helper. */
export function pinPeerHelper(file: string, expected: string): () => void {
  try {
    if (
      !/^[a-f0-9]{64}$/.test(expected) ||
      !path.isAbsolute(file) ||
      /[\x00-\x1f\x7f]/.test(file) ||
      fs.realpathSync(file) !== file
    )
      throw Error();
    const tracked = new Map<string, string>();
    function stamp(stat: fs.BigIntStats, leaf: boolean) {
      return [
        stat.dev,
        stat.ino,
        stat.uid,
        stat.mode,
        ...(leaf ? [stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs] : []),
      ].join(':');
    }
    let current = file;
    while (current !== path.dirname(current)) {
      const stat = fs.lstatSync(current, { bigint: true }),
        leaf = current === file;
      if (
        stat.isSymbolicLink() ||
        ![0n, BigInt(process.getuid!())].includes(stat.uid) ||
        (stat.mode & 0o022n && !(stat.isDirectory() && stat.mode & 0o1000n)) ||
        (leaf
          ? !stat.isFile() ||
            stat.nlink !== 1n ||
            stat.size < 1n ||
            stat.size > 16n * 1024n * 1024n ||
            !(stat.mode & 0o111n)
          : !stat.isDirectory())
      )
        throw Error();
      tracked.set(current, stamp(stat, leaf));
      current = path.dirname(current);
    }
    function assertUnchanged() {
      try {
        for (const [name, saved] of tracked)
          if (
            stamp(fs.lstatSync(name, { bigint: true }), name === file) !== saved
          )
            throw Error();
      } catch {
        throw Error('Peer unverified');
      }
    }
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      if (
        stamp(fs.fstatSync(fd, { bigint: true }), true) !== tracked.get(file) ||
        createHash('sha256').update(fs.readFileSync(fd)).digest('hex') !==
          expected ||
        stamp(fs.fstatSync(fd, { bigint: true }), true) !== tracked.get(file)
      )
        throw Error();
    } finally {
      fs.closeSync(fd);
    }
    assertUnchanged();
    return assertUnchanged;
  } catch {
    throw Error('Peer unverified');
  }
}
