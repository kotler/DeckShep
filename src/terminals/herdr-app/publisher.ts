import * as path from 'node:path';
import { exec } from '../../platform/exec';

/** Navigation accepts signed updates from the calibrated publisher. This rule
 * grants no provider input capability (ADR 0008). */
export function publisherCheck(run: typeof exec = exec) {
  let lastBuild: string | undefined;
  return async (
    file: string,
    cdHash: string,
    binarySha256: string,
    plistSha256: string,
  ): Promise<void> => {
    if (
      !/^[a-f0-9]{40}$/.test(cdHash) ||
      !file.endsWith('.app/Contents/MacOS/Herdr')
    )
      throw Error('Peer unverified');
    const identity = JSON.stringify([file, cdHash, binarySha256, plistSha256]);
    if (identity === lastBuild) return;
    const bundle = path.dirname(path.dirname(path.dirname(file)));
    // The kernel socket peer supplies the signing hash. Verify that same image,
    // rather than trusting a version string or an application found by name.
    const requirement =
      '=anchor apple generic and identifier "dev.herdr.app" and certificate leaf[subject.OU] = "2W9652Q7QR" and cdhash H"' +
      cdHash +
      '"';
    await run(
      '/usr/bin/codesign',
      ['--verify', '--strict', '-R', requirement, bundle],
      {
        timeout: 500,
        message: 'Peer unverified',
      },
    );
    lastBuild = identity;
  };
}
