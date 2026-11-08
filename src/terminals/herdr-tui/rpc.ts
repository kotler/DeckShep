const boundary = require('../../schemas');
type StringDecoder = import('node:string_decoder').StringDecoder;
type AgentSnapshot = import('../../domain/types').AgentSnapshot;
type Config = import('../../domain/types').Config;
type PressContext = import('../../domain/types').PressContext;
('use strict');
const { StringDecoder } = require('node:string_decoder');
const fs = require('node:fs'),
  net = require('node:net'),
  os = require('node:os'),
  path = require('node:path'),
  crypto = require('node:crypto');
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
function endpoint(value: any) {
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
  const parent: import('node:fs').Stats = fs.lstatSync(path.dirname(file)),
    stat: import('node:fs').Stats = fs.lstatSync(file);
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
const paneId: (s: any) => boolean = (s: any) =>
  typeof s === 'string' && /^w[a-zA-Z0-9_-]+:p[a-zA-Z0-9_-]+$/.test(s);
function validate(method: string, p: any) {
  if (!METHODS.has(method) || !p || typeof p !== 'object' || Array.isArray(p))
    throw Error('Unsupported Herdr request');
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
      !['visible', 'detection'].includes(p.source) ||
      !['text', 'ansi'].includes(p.format) ||
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
      arrows: any =
        Array.isArray(p.keys) &&
        p.keys.length > 1 &&
        p.keys.length <= 4 &&
        ['up', 'down', 'left', 'right'].includes(p.keys[0]) &&
        p.keys.every((key: any) => key === p.keys[0]);
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
class HerdrRpc {
  declare socketPath: any;
  declare resolve: any;
  declare open: any;
  declare nextId: number;
  declare pending: Map<any, any>;
  declare verified: boolean;
  declare closed: boolean;
  declare timeout: any;
  declare endpoint: any;
  constructor(socketPath: any, deps: Record<string, any> | undefined = {}) {
    this.socketPath = socketPath;
    this.resolve = deps.endpoint || endpoint;
    this.open =
      deps.connect ||
      (((file: string) => net.createConnection(file)) as (
        file: string,
      ) => import('node:net').Socket);
    this.nextId = 0;
    this.pending = new Map();
    this.verified = false;
    this.closed = false;
    this.timeout = deps.timeout || 4000;
  }
  async connect() {
    this.endpoint = this.resolve(this.socketPath);
    try {
      const pong: any = await this.exchange('ping', {});
      if (
        pong?.type !== 'pong' ||
        pong.protocol !== 22 ||
        !/^0\.9\.5(?:[-+].*)?$/.test(pong.version || '')
      )
        throw Error('Herdr version/protocol not verified');
      this.verified = true;
      return this;
    } catch (error: unknown) {
      this.close();
      throw error;
    }
  }
  request(method: string, params: any, beforeWrite?: () => void) {
    try {
      validate(method, params);
      if (!this.verified || this.closed)
        throw Error('Herdr connection is not verified');
    } catch (error: unknown) {
      return Promise.reject(error);
    }
    return this.exchange(method, params, beforeWrite);
  }
  exchange(method: string, params: any, beforeWrite?: () => void) {
    const id: string = 'switchboard-' + ++this.nextId;
    return new Promise(
      (resolve: (value: any) => void, reject: (reason?: any) => void) => {
        let socket: any,
          done: boolean = false,
          buffer: string = '';
        const decoder: StringDecoder = new StringDecoder('utf8');
        const finish: any = (error: any, result?: any) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this.pending.delete(id);
          socket?.destroy();
          error ? reject(error) : resolve(result);
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
          socket = this.open(this.endpoint.file);
          socket.on('error', () =>
            finish(Error('Herdr disconnected; verify any requested change')),
          );
          socket.on('end', () =>
            finish(Error('Herdr disconnected; verify any requested change')),
          );
          socket.on('close', () =>
            finish(Error('Herdr disconnected; verify any requested change')),
          );
          socket.on('connect', () => {
            try {
              if (
                this.resolve(this.socketPath).identity !==
                this.endpoint.identity
              )
                throw Error('Herdr session changed while connecting');
              beforeWrite?.();
              socket.write(
                JSON.stringify({ id, method, params }) + '\n',
                (error: any) => {
                  if (error)
                    finish(
                      Error('Herdr write failed; verify any requested change'),
                    );
                },
              );
            } catch (error: unknown) {
              finish(error);
            }
          });
          socket.on('data', (chunk: any) => {
            buffer += decoder.write(chunk);
            if (Buffer.byteLength(buffer) > 4e6) {
              finish(Error('Herdr response too large'));
              return;
            }
            const end: number = buffer.indexOf('\n');
            if (end < 0) return;
            let message: any;
            try {
              message = boundary.parse('herdrFrame', buffer.slice(0, end));
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
          finish(error);
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
module.exports = { HerdrRpc, endpoint, validate, paneId };

export { HerdrRpc };
