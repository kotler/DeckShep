import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { parse } from '../../schemas';

/** A verified Herdr session socket: where to connect and how to recognise it. */
export interface HerdrEndpoint {
  file: string;
  identity: string;
  scope?: string;
}
/** The object a Herdr request resolves with. */
export type HerdrResult = Record<string, unknown>;
type HerdrParams = Record<string, unknown>;
/** Test seams: replace socket resolution, connection and the request timeout. */
export interface HerdrRpcDeps {
  endpoint?: (socketPath: string) => HerdrEndpoint;
  connect?: (file: string) => net.Socket;
  timeout?: number;
}
const METHODS: Set<string> = new Set([
  'ping',
  'session.snapshot',
  'agent.get',
  'agent.focus',
  'agent.read',
  'agent.send_keys',
  'pane.process_info',
  'pane.get',
  'pane.zoom',
]);
export function endpoint(value: unknown): HerdrEndpoint & { scope: string } {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 1024 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw Error('Choose a Herdr session socket');
  const file: string = value.startsWith('~/')
    ? path.join(os.homedir(), value.slice(2))
    : value;
  if (!path.isAbsolute(file))
    throw Error('Herdr socket must be an absolute path');
  const parent: fs.Stats = fs.lstatSync(path.dirname(file)),
    stat: fs.Stats = fs.lstatSync(file);
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== (process.getuid as () => number)() ||
    parent.mode & 0o022 ||
    !stat.isSocket() ||
    stat.uid !== (process.getuid as () => number)() ||
    stat.mode & 0o077
  )
    throw Error('Unsafe Herdr session socket');
  const identity: string = [fs.realpathSync(file), stat.dev, stat.ino].join(
    '|',
  );
  return {
    file,
    identity,
    scope:
      'herdr:' +
      crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24),
  };
}
export const paneId: (s: unknown) => boolean = (s: unknown) =>
  typeof s === 'string' && /^w[a-zA-Z0-9_-]+:p[a-zA-Z0-9_-]+$/.test(s);
export function validate(method: string, params: unknown) {
  if (
    !METHODS.has(method) ||
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params)
  )
    throw Error('Unsupported Herdr request');
  const p = params as HerdrParams;
  const keys: string = Object.keys(p).sort().join(',');
  if (['ping', 'session.snapshot'].includes(method)) {
    if (keys) throw Error('Unexpected Herdr read parameters');
    return;
  }
  if (['agent.get', 'agent.focus'].includes(method)) {
    if (keys !== 'target' || !paneId(p.target))
      throw Error('Explicit Herdr pane required');
    return;
  }
  if (method === 'agent.read') {
    if (
      keys !== 'format,source,strip_ansi,target' ||
      !paneId(p.target) ||
      !(['visible', 'detection'] as readonly unknown[]).includes(p.source) ||
      !(['text', 'ansi'] as readonly unknown[]).includes(p.format) ||
      p.strip_ansi !== (p.format === 'text')
    )
      throw Error('Only complete Herdr viewport reads are allowed');
    return;
  }
  if (method === 'agent.send_keys') {
    const one: boolean =
        Array.isArray(p.keys) &&
        p.keys.length === 1 &&
        [
          'up',
          'down',
          'left',
          'right',
          'esc',
          'enter',
          'tab',
          'shift+tab',
          'space',
          'alt+p',
          's',
        ].includes(p.keys[0]),
      arrows: boolean =
        Array.isArray(p.keys) &&
        p.keys.length > 1 &&
        p.keys.length <= 4 &&
        ['up', 'down', 'left', 'right'].includes(p.keys[0]) &&
        p.keys.every((key: unknown) => key === (p.keys as unknown[])[0]);
    if (keys !== 'keys,target' || !paneId(p.target) || (!one && !arrows))
      throw Error(
        'Only a guarded native key or bounded arrow batch is allowed',
      );
    return;
  }
  if (method === 'pane.zoom') {
    if (keys !== 'mode,pane_id' || !paneId(p.pane_id) || p.mode !== 'toggle')
      throw Error('Only explicit pane zoom is allowed');
    return;
  }
  if (keys !== 'pane_id' || !paneId(p.pane_id))
    throw Error('Explicit Herdr pane required');
}

/**
 * A filesystem error names the socket path in its message. Guard refusals
 * raised before a write carry no syscall and pass through unchanged.
 */
function pathFree(error: unknown): unknown {
  return typeof (error as NodeJS.ErrnoException | null)?.syscall === 'string'
    ? Error('Herdr session replaced or offline')
    : error;
}
export class HerdrRpc {
  declare socketPath: string;
  declare resolve: (socketPath: string) => HerdrEndpoint;
  declare open: (file: string) => net.Socket;
  declare nextId: number;
  declare pending: Map<string, { cancel: () => void }>;
  declare verified: boolean;
  declare closed: boolean;
  declare timeout: number;
  declare endpoint: HerdrEndpoint;
  info: { protocol: number; version: string } | null = null;
  constructor(socketPath: string, deps: HerdrRpcDeps | undefined = {}) {
    this.socketPath = socketPath;
    this.resolve = deps.endpoint || endpoint;
    this.open = deps.connect || ((file: string) => net.createConnection(file));
    this.nextId = 0;
    this.pending = new Map();
    this.verified = false;
    this.closed = false;
    this.timeout = deps.timeout || 4000;
  }
  async connect() {
    try {
      this.endpoint = this.resolve(this.socketPath);
    } catch (error: unknown) {
      // A filesystem failure names the socket path; never let that escape.
      if (typeof (error as NodeJS.ErrnoException)?.code === 'string')
        throw Error('Herdr session replaced or offline');
      throw error;
    }
    try {
      const pong: HerdrResult = await this.exchange('ping', {});
      if (
        pong?.type !== 'pong' ||
        pong.protocol !== 22 ||
        !/^0\.9\.5(?:[-+].*)?$/.test(String(pong.version || ''))
      )
        throw Error('Herdr version/protocol not verified');
      this.info = { protocol: pong.protocol, version: pong.version as string };
      this.verified = true;
      return this;
    } catch (error: unknown) {
      this.close();
      throw error;
    }
  }
  request(method: string, params: HerdrParams, beforeWrite?: () => void) {
    try {
      validate(method, params);
      if (!this.verified || this.closed)
        throw Error('Herdr connection is not verified');
    } catch (error: unknown) {
      return Promise.reject(error);
    }
    return this.exchange(method, params, beforeWrite);
  }
  exchange(
    method: string,
    params: HerdrParams,
    beforeWrite?: () => void,
  ): Promise<HerdrResult> {
    const id: string = 'deckshep-' + ++this.nextId;
    return new Promise(
      (
        resolve: (value: HerdrResult) => void,
        reject: (reason?: unknown) => void,
      ) => {
        let socket: net.Socket | undefined,
          done: boolean = false,
          buffer: string = '';
        const decoder: StringDecoder = new StringDecoder('utf8');
        const finish = (error: unknown, result?: HerdrResult) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this.pending.delete(id);
          socket?.destroy();
          error ? reject(error) : resolve(result as HerdrResult);
        };
        const timer: NodeJS.Timeout = setTimeout(
          () => finish(Error('Herdr timeout; verify any requested change')),
          this.timeout,
        );
        this.pending.set(id, {
          cancel: () =>
            finish(Error('Herdr disconnected; verify any requested change')),
        });
        try {
          if (
            this.closed ||
            this.resolve(this.socketPath).identity !== this.endpoint.identity
          )
            throw Error('Herdr session replaced or offline');
          const live: net.Socket = (socket = this.open(this.endpoint.file));
          live.on('error', () =>
            finish(Error('Herdr disconnected; verify any requested change')),
          );
          live.on('end', () =>
            finish(Error('Herdr disconnected; verify any requested change')),
          );
          live.on('close', () =>
            finish(Error('Herdr disconnected; verify any requested change')),
          );
          live.on('connect', () => {
            try {
              if (
                this.resolve(this.socketPath).identity !==
                this.endpoint.identity
              )
                throw Error('Herdr session changed while connecting');
              beforeWrite?.();
              live.write(
                JSON.stringify({ id, method, params }) + '\n',
                (error?: Error | null) => {
                  if (error)
                    finish(
                      Error('Herdr write failed; verify any requested change'),
                    );
                },
              );
            } catch (error: unknown) {
              finish(pathFree(error));
            }
          });
          live.on('data', (chunk: Buffer) => {
            buffer += decoder.write(chunk);
            if (Buffer.byteLength(buffer) > 4e6) {
              finish(Error('Herdr response too large'));
              return;
            }
            const end: number = buffer.indexOf('\n');
            if (end < 0) return;
            let message: ReturnType<typeof parse<'herdrFrame'>>;
            try {
              message = parse('herdrFrame', buffer.slice(0, end));
            } catch {
              finish(Error('Invalid Herdr response'));
              return;
            }
            if (message.id !== id) {
              finish(Error('Unexpected Herdr response'));
              return;
            }
            if (message.error)
              finish(Error('Herdr request refused; verify the session'));
            else if (!message.result || typeof message.result !== 'object')
              finish(Error('Invalid Herdr response'));
            else finish(null, message.result);
          });
        } catch (error: unknown) {
          finish(pathFree(error));
        }
      },
    );
  }
  close() {
    this.closed = true;
    this.verified = false;
    for (const p of [...this.pending.values()]) p.cancel();
  }
}
