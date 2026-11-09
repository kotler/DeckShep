import { createConnection, type Socket } from 'node:net';
import { TextDecoder } from 'node:util';
import { parse, validate } from '../../schemas';
import { inspectSocket, type SocketEndpoint } from './endpoint';

export interface TransportOptions {
  timeoutMs?: number;
  maxBytes?: number;
}
type Protocol = 'app' | 'core';
interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}
/** Plain mode only. Even this lower-level writer validates a read-only request
 * union, so adding a caller cannot quietly introduce an unguarded mutation. */
export class ReadOnlyLines {
  readonly #timeout: number;
  readonly #limit: number;
  #socket: Socket | null = null;
  #endpoint: SocketEndpoint | null = null;
  #pending: Pending | null = null;
  #buffer = Buffer.alloc(0);
  #closed = false;
  #cancelOpen: ((error: Error) => void) | null = null;
  #removeAbort: (() => void) | null = null;
  constructor(
    private readonly file: string,
    private readonly protocol: Protocol,
    options: TransportOptions = {},
    private readonly onClose: () => void = () => {},
  ) {
    this.#timeout = options.timeoutMs ?? 4000;
    this.#limit = options.maxBytes ?? 1000000;
    if (
      !Number.isSafeInteger(this.#timeout) ||
      this.#timeout < 1 ||
      this.#timeout > 60000 ||
      !Number.isSafeInteger(this.#limit) ||
      this.#limit < 16 ||
      this.#limit > 4000000
    )
      throw Error('Invalid Herdr App transport limits');
  }
  get identity(): string {
    return this.#endpoint?.identity ?? '';
  }
  async open(signal?: AbortSignal): Promise<void> {
    if (this.#socket || this.#closed)
      throw Error('Herdr App connection closed');
    if (signal?.aborted) throw Error('Herdr App connection cancelled');
    this.#endpoint = inspectSocket(this.file, this.#policy());
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.#cancelOpen = null;
        if (error) {
          this.close();
          reject(error);
        } else resolve();
      };
      const abort = () => this.close(Error('Herdr App connection cancelled'));
      const timer = setTimeout(
        () => finish(Error('Herdr App connection timeout')),
        this.#timeout,
      );
      this.#cancelOpen = finish;
      signal?.addEventListener('abort', abort, { once: true });
      this.#removeAbort = () => signal?.removeEventListener('abort', abort);
      const socket = createConnection(this.#endpoint!.file);
      this.#socket = socket;
      socket.once('connect', () => {
        try {
          this.assertEndpoint();
          finish();
        } catch {
          finish(Error('Herdr App endpoint changed'));
        }
      });
      socket.on('error', () => this.close());
      socket.on('end', () => this.close());
      socket.on('close', () => this.close());
      socket.on('data', (chunk: Buffer) => this.receive(chunk));
    });
  }
  async request(payload: unknown): Promise<unknown> {
    // Validate before looking up a path or opening/writing any socket.
    const request = validate(
      this.protocol === 'app' ? 'herdrAppRequest' : 'herdrCoreRequest',
      payload,
    );
    if (this.#closed || !this.#socket || !this.#endpoint)
      return Promise.reject(Error('Herdr App connection closed'));
    if (this.#pending)
      return Promise.reject(Error('Herdr App read already pending'));
    try {
      this.assertEndpoint();
    } catch {
      this.close();
      return Promise.reject(Error('Herdr App endpoint changed'));
    }
    return new Promise((resolve, reject) => {
      this.#pending = {
        resolve,
        reject,
        timer: setTimeout(
          () => this.close(Error('Herdr App read timeout')),
          this.#timeout,
        ),
      };
      this.#socket!.write(JSON.stringify(request) + '\n', (error) => {
        if (error) this.close();
      });
    });
  }
  #policy() {
    return { ownerOnlyParentSuffices: this.protocol === 'core' };
  }
  private assertEndpoint(): void {
    if (
      inspectSocket(this.file, this.#policy()).identity !==
      this.#endpoint?.identity
    )
      throw Error();
  }
  private receive(chunk: Buffer): void {
    try {
      if (!this.#pending || this.#buffer.length + chunk.length > this.#limit)
        throw Error();
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      const end = this.#buffer.indexOf(10);
      if (end < 0) return;
      if (this.#buffer.subarray(end + 1).length) throw Error();
      const line = new TextDecoder('utf-8', { fatal: true }).decode(
        this.#buffer.subarray(0, end),
      );
      const message = parse(
        this.protocol === 'app' ? 'herdrAppMessage' : 'herdrCoreMessage',
        line,
      );
      this.assertEndpoint();
      this.#buffer = Buffer.alloc(0);
      const pending = this.#pending;
      this.#pending = null;
      clearTimeout(pending.timer);
      pending.resolve(message);
    } catch {
      this.close(Error('Invalid Herdr App response'));
    }
  }
  close(error = Error('Herdr App connection closed')): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#socket?.destroy();
    this.#removeAbort?.();
    this.#removeAbort = null;
    this.#buffer = Buffer.alloc(0);
    const opening = this.#cancelOpen,
      pending = this.#pending;
    this.#cancelOpen = null;
    this.#pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    opening?.(error);
    this.onClose();
  }
}
