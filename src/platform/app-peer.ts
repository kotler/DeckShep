import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { Socket } from 'node:net';

/** The helper inspects inherited descriptor 3; it never connects by pathname.
 * This adapter is unwired, and its helper is not yet included in distributions. */
export function nativeAppPeerProbe(helper: string) {
  if (!path.isAbsolute(helper) || /[\x00-\x1f\x7f]/.test(helper))
    throw Error('Peer unverified');
  return (socket: Socket, signal?: AbortSignal): Promise<unknown> => {
    if (process.platform !== 'darwin' || signal?.aborted)
      return Promise.reject(Error('Peer unverified'));
    return new Promise((resolve, reject) => {
      const child = spawn(helper, [], {
        stdio: ['ignore', 'pipe', 'ignore', socket],
        env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
        signal,
        timeout: 500,
      });
      let output = Buffer.alloc(0),
        failed = false;
      child.stdout?.on('data', (bytes: Buffer) => {
        if (output.length + bytes.length > 8192) {
          failed = true;
          child.kill();
        } else output = Buffer.concat([output, bytes]);
      });
      child.on('error', () => {
        failed = true;
      });
      child.once('close', (code) => {
        try {
          if (failed || code !== 0 || signal?.aborted) throw Error();
          resolve(
            JSON.parse(
              new TextDecoder('utf-8', { fatal: true }).decode(output),
            ),
          );
        } catch {
          reject(Error('Peer unverified'));
        }
      });
    });
  };
}
