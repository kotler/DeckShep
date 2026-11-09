import { spawn } from 'node:child_process';
import type { Socket } from 'node:net';
import { pinPeerHelper } from './peer-helper-integrity';
import { packagedPeerHelperSha256 } from './peer-helper-pin';
import { peerSessionFrame } from './peer-session-frame';

export interface NativePeerSession {
  readonly captured: unknown;
  check(): Promise<unknown>;
  finish(): Promise<unknown>;
  dispose(): Promise<void>;
}
export type PeerSessionFactory = (
  socket: Socket,
  signal?: AbortSignal,
) => Promise<NativePeerSession>;

/** One owned helper for one connection/request. No token or PID is supplied. */
export function nativeAppPeerSession(
  helper: string,
  hash = packagedPeerHelperSha256,
): PeerSessionFactory {
  return async (socket, signal) => {
    if (process.platform !== 'darwin' || signal?.aborted || socket.destroyed)
      throw Error('Peer unverified');
    const started = performance.now(),
      unchanged = pinPeerHelper(helper, hash);
    const wasFlowing = socket.readableFlowing === true;
    const child = spawn(helper, ['--session'], {
      stdio: ['pipe', 'pipe', 'ignore', socket],
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
    });
    const input = child.stdin ?? unavailable(),
      output = child.stdout ?? unavailable();
    function unavailable(): never {
      child.kill('SIGKILL');
      throw Error('Peer unverified');
    }
    let buffer = Buffer.alloc(0),
      total = 0,
      failed = false,
      seq = 0,
      busy = false,
      disposed = false;
    let pending: {
      resolve(value: unknown): void;
      reject(error: Error): void;
    } | null = null;
    let exited = false,
      exitCode: number | null = null;
    const closed = new Promise<void>((resolve) =>
      child.once('close', (code) => {
        exited = true;
        exitCode = code;
        if (seq !== 2 || pending || buffer.length) fail();
        resolve();
      }),
    );
    function restore() {
      if (wasFlowing && !socket.destroyed) socket.resume();
    }
    function fail() {
      failed = true;
      pending?.reject(Error('Peer unverified'));
      pending = null;
      if (!exited) child.kill('SIGKILL');
      restore();
    }
    const deadline = setTimeout(
      fail,
      Math.max(1, 1000 - (performance.now() - started)),
    );
    const abort = () => fail();
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', fail);
    input.on('error', fail);
    output.on('data', (bytes: Buffer) => {
      try {
        total += bytes.length;
        if (failed || total > 8192) throw Error();
        buffer = Buffer.concat([buffer, bytes]);
        const end = buffer.indexOf(10);
        if (end < 0) return;
        if (end !== buffer.length - 1 || !pending) throw Error();
        const state = ['captured', 'checked', 'finished'][seq];
        const value = peerSessionFrame(buffer.subarray(0, end), seq, state);
        buffer = Buffer.alloc(0);
        const reply = pending;
        pending = null;
        reply.resolve(value);
      } catch {
        fail();
      }
    });
    function current() {
      if (
        failed ||
        disposed ||
        signal?.aborted ||
        socket.destroyed ||
        performance.now() - started >= 1000
      )
        throw Error('Peer unverified');
      unchanged();
    }
    async function exchange(next: number, op?: string): Promise<unknown> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        current();
        if (busy || next !== seq + (op ? 1 : 0) || (exited && op))
          throw Error();
        busy = true;
        seq = next;
        const result = await new Promise<unknown>((resolve, reject) => {
          pending = { resolve, reject };
          timer = setTimeout(
            fail,
            Math.max(1, Math.min(500, 1000 - (performance.now() - started))),
          );
          if (op) {
            const command = JSON.stringify({ protocol: 2, seq, op }) + '\n';
            if (op === 'finish') input.end(command);
            else input.write(command);
          }
        });
        current();
        if (next === 0) restore();
        return result;
      } catch {
        fail();
        throw Error('Peer unverified');
      } finally {
        clearTimeout(timer);
        busy = false;
      }
    }
    async function dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
      if (!exited) fail();
      input.destroy();
      await closed;
      restore();
    }
    try {
      const captured = await exchange(0);
      return Object.freeze({
        captured,
        check: () => exchange(1, 'check'),
        async finish() {
          const result = await exchange(2, 'finish');
          input.end();
          await closed;
          current();
          if (exitCode !== 0) throw Error('Peer unverified');
          await dispose();
          return result;
        },
        dispose,
      });
    } catch {
      await dispose();
      throw Error('Peer unverified');
    }
  };
}
