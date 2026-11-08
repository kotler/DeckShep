// @ts-check
/** @typedef {import("../src/domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../src/domain/types").Config} Config */
/** @typedef {import("../src/domain/types").PressContext} PressContext */
'use strict';
const { StringDecoder } = require('node:string_decoder');
const fs = require('node:fs'),
  net = require('node:net'),
  os = require('node:os'),
  path = require('node:path'),
  crypto = require('node:crypto');
const METHODS = new Set([
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
/** @param {any} value */
function endpoint(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 1024 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw Error('Choose a Herdr session socket');
  const file = value.startsWith('~/')
    ? path.join(os.homedir(), value.slice(2))
    : value;
  if (!path.isAbsolute(file))
    throw Error('Herdr socket must be an absolute path');
  const parent = fs.lstatSync(path.dirname(file)),
    stat = fs.lstatSync(file);
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== /** @type {() => number} */ (process.getuid)() ||
    parent.mode & 0o022 ||
    !stat.isSocket() ||
    stat.uid !== /** @type {() => number} */ (process.getuid)() ||
    stat.mode & 0o077
  )
    throw Error('Unsafe Herdr session socket');
  const identity = [fs.realpathSync(file), stat.dev, stat.ino].join('|');
  return {
    file,
    identity,
    scope:
      'herdr:' +
      crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24),
  };
}
const paneId =
  /** @param {any} s */
  (s) => typeof s === 'string' && /^w[a-zA-Z0-9_-]+:p[a-zA-Z0-9_-]+$/.test(s);
/** @param {string} method
 * @param {any} p */
function validate(method, p) {
  if (!METHODS.has(method) || !p || typeof p !== 'object' || Array.isArray(p))
    throw Error('Unsupported Herdr request');
  const keys = Object.keys(p).sort().join(',');
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
    const one =
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
      arrows =
        Array.isArray(p.keys) &&
        p.keys.length > 1 &&
        p.keys.length <= 4 &&
        ['up', 'down', 'left', 'right'].includes(p.keys[0]) &&
        p.keys.every(/** @param {any} key */ (key) => key === p.keys[0]);
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
  /** @param {any} socketPath
   * @param {Record<string, any>} [deps] */
  constructor(socketPath, deps = {}) {
    this.socketPath = socketPath;
    this.resolve = deps.endpoint || endpoint;
    this.open =
      deps.connect ||
      /** @type {(file: string) => import("node:net").Socket} */ (
        (file) => net.createConnection(file)
      );
    this.nextId = 0;
    this.pending = new Map();
    this.verified = false;
    this.closed = false;
    this.timeout = deps.timeout || 4000;
  }
  async connect() {
    this.endpoint = this.resolve(this.socketPath);
    try {
      const pong = await this.exchange('ping', {});
      if (
        pong?.type !== 'pong' ||
        pong.protocol !== 22 ||
        !/^0\.9\.5(?:[-+].*)?$/.test(pong.version || '')
      )
        throw Error('Herdr version/protocol not verified');
      this.verified = true;
      return this;
    } catch (error) {
      this.close();
      throw error;
    }
  }
  /** @param {string} method
   * @param {any} params */
  request(method, params) {
    try {
      validate(method, params);
      if (!this.verified || this.closed)
        throw Error('Herdr connection is not verified');
    } catch (error) {
      return Promise.reject(error);
    }
    return this.exchange(method, params);
  }
  /** @param {string} method
   * @param {any} params */
  exchange(method, params) {
    // Ordinary Herdr 0.9.5 requests use one connection each. The server closes
    // after its response; only subscription requests keep a stream open.
    const id = 'switchboard-' + ++this.nextId;
    return new Promise((resolve, reject) => {
      let /** @type {any} */ socket,
        done = false,
        buffer = '';
      const decoder = new StringDecoder('utf8');
      const /** @type {any} */ finish =
          /** @param {any} error
           * @param {any} [result] */
          (error, result) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            this.pending.delete(id);
            socket?.destroy();
            error ? reject(error) : resolve(result);
          };
      const timer = setTimeout(
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
              this.resolve(this.socketPath).identity !== this.endpoint.identity
            )
              throw Error('Herdr session changed while connecting');
            socket.write(
              JSON.stringify({ id, method, params }) + '\n',
              /** @param {any} error */ (error) => {
                if (error)
                  finish(
                    Error('Herdr write failed; verify any requested change'),
                  );
              },
            );
          } catch (error) {
            finish(error);
          }
        });
        socket.on(
          'data',
          /** @param {any} chunk */ (chunk) => {
            buffer += decoder.write(chunk);
            if (Buffer.byteLength(buffer) > 4e6) {
              finish(Error('Herdr response too large'));
              return;
            }
            const end = buffer.indexOf('\n');
            if (end < 0) return;
            let message;
            try {
              message = JSON.parse(buffer.slice(0, end));
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
          },
        );
      } catch (error) {
        finish(error);
      }
    });
  }
  close() {
    this.closed = true;
    this.verified = false;
    for (const p of [...this.pending.values()]) p.cancel();
  }
}
module.exports = { HerdrRpc, endpoint, validate, paneId };
