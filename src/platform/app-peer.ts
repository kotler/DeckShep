import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { Socket } from 'node:net';

/** The packaged helper inspects inherited descriptor 3; it never connects by
 * pathname. Empty production build records keep the App path disabled. */
export function nativeAppPeerProbe(helper: string) {
  if (!path.isAbsolute(helper) || /[\x00-\x1f\x7f]/.test(helper))
    throw Error('Peer unverified');
  return (socket: Socket, signal?: AbortSignal): Promise<unknown> => {
    if (process.platform !== 'darwin' || signal?.aborted)
      return Promise.reject(Error('Peer unverified'));
    const wasFlowing = socket.readableFlowing === true;
    return new Promise<unknown>((resolve, reject) => {
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
    }).finally(() => {
      // Node stops reads when a socket is inherited as stdio. The read-only
      // descriptor helper has exited; restore an active reader before callers
      // await replies, while preserving an explicitly paused caller's state.
      if (wasFlowing && !socket.destroyed) socket.resume();
    });
  };
}
