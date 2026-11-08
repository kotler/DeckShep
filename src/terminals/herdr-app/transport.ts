import { validate, type Boundary, type schemas } from '../../schemas';
import type { z } from 'zod';
import { appSocket, type AppHomeOptions } from './endpoint';
import { ReadOnlyLines, type TransportOptions } from './line-client';

type Data<K extends Boundary> = z.infer<(typeof schemas)[K]>;
export type CoreHello = Data<'herdrCoreHello'>;

/** Unwired read-only clients. No version probe launches an executable, and no
 * App action, terminal attachment, history scroll or provider write is exposed. */
export class HerdrAppClient {
  readonly #file: string;
  readonly #active = new Set<ReadOnlyLines>();
  #disposed = false;
  #identity = '';
  generation = 0;
  constructor(
    private readonly options: AppHomeOptions & TransportOptions = {},
  ) {
    this.#file = appSocket(options);
  }
  ls(signal?: AbortSignal): Promise<Data<'herdrAppWorld'>> {
    return this.read('herdrAppWorld', { ls: true }, signal);
  }
  status(signal?: AbortSignal): Promise<Data<'herdrAppStatus'>> {
    return this.read('herdrAppStatus', { status: true }, signal);
  }
  commands(signal?: AbortSignal): Promise<Data<'herdrAppCommands'>> {
    return this.read('herdrAppCommands', { commands: true }, signal);
  }
  private async read<K extends Boundary>(
    schema: K,
    request: unknown,
    signal?: AbortSignal,
  ): Promise<Data<K>> {
    if (this.#disposed) throw Error('Herdr App client disposed');
    const connection = new ReadOnlyLines(this.#file, 'app', this.options);
    this.#active.add(connection);
    try {
      await connection.open(signal);
      if (this.#identity !== connection.identity) {
        this.#identity = connection.identity;
        this.generation++;
      }
      const reply = await connection.request(request);
      if (reply && typeof reply === 'object' && 'error' in reply)
        throw Error('Herdr App read refused');
      return validate(schema, reply);
    } finally {
      connection.close();
      this.#active.delete(connection);
    }
  }
  dispose(): void {
    this.#disposed = true;
    this.generation++;
    for (const connection of this.#active) connection.close();
    this.#active.clear();
  }
}

const readMethods = [
  'hello',
  'server.status',
  'terminal.list',
  'terminal.get',
  'terminal.read',
];
export class HerdrCoreClient {
  #connection: ReadOnlyLines | null = null;
  #hello: CoreHello | null = null;
  #nextId = 0;
  #queue: Promise<unknown> = Promise.resolve();
  generation = 0;
  constructor(
    private readonly socketPath: string,
    private readonly options: TransportOptions = {},
  ) {}
  get info(): CoreHello | null {
    return this.#hello && structuredClone(this.#hello);
  }
  async connect(signal?: AbortSignal): Promise<CoreHello> {
    this.close();
    const connection = new ReadOnlyLines(
      this.socketPath,
      'core',
      this.options,
      () => {
        if (this.#connection === connection) this.close();
      },
    );
    this.#connection = connection;
    try {
      await connection.open(signal);
      const hello = await this.exchange(
        connection,
        'hello',
        { generation: 1, framed: false },
        'herdrCoreHello',
      );
      if (
        !readMethods.every((method) => hello.methods.includes(method)) ||
        !hello.features.includes('status')
      )
        throw Error('Herdr core read protocol unsupported');
      this.#hello = hello;
      return structuredClone(hello);
    } catch (error) {
      if (this.#connection === connection) this.close();
      throw error;
    }
  }
  list(): Promise<Data<'herdrCoreList'>> {
    return this.read('terminal.list', { all: false }, 'herdrCoreList');
  }
  get(terminal: string): Promise<Data<'herdrCoreTerminal'>> {
    return this.read('terminal.get', { terminal }, 'herdrCoreTerminal');
  }
  readPane(terminal: string): Promise<Data<'herdrCoreRead'>> {
    return this.read('terminal.read', { terminal, lines: 0 }, 'herdrCoreRead');
  }
  status(): Promise<Data<'herdrCoreStatus'>> {
    return this.read('server.status', {}, 'herdrCoreStatus');
  }
  private async read<K extends Boundary>(
    method: string,
    params: unknown,
    schema: K,
  ): Promise<Data<K>> {
    const connection = this.#connection,
      generation = this.generation;
    // Reject local aliases, caller attribution and all input before any I/O.
    validate('herdrCoreRequest', { jsonrpc: '2.0', id: 1, method, params });
    const result = this.#queue.then(async () => {
      if (
        !connection ||
        !this.#hello ||
        connection !== this.#connection ||
        generation !== this.generation
      )
        throw Error('Herdr core connection changed');
      try {
        return await this.exchange(connection, method, params, schema);
      } catch (error) {
        if (this.#connection === connection) this.close();
        throw error;
      }
    });
    this.#queue = result.catch(() => {});
    return result;
  }
  private async exchange<K extends Boundary>(
    connection: ReadOnlyLines,
    method: string,
    params: unknown,
    schema: K,
  ): Promise<Data<K>> {
    const id = ++this.#nextId;
    const response = await connection.request({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });
    const message = validate('herdrCoreMessage', response);
    if (connection !== this.#connection || message.id !== id)
      throw Error('Unexpected Herdr core response');
    if ('error' in message) throw Error('Herdr core read refused');
    const result = validate(schema, message.result);
    if (schema === 'herdrCoreStatus') {
      const status = result as Data<'herdrCoreStatus'>;
      if (
        status.version !== this.#hello?.version ||
        status.core.id !== this.#hello?.core.id
      )
        throw Error('Herdr core identity changed');
    }
    if (schema === 'herdrCoreRead') {
      const view = result as Data<'herdrCoreRead'>;
      if (!view.complete || view.how !== 'screen')
        throw Error('Herdr core screen incomplete');
    }
    return result;
  }
  close(): void {
    const connection = this.#connection;
    this.#connection = null;
    this.#hello = null;
    this.generation++;
    connection?.close();
  }
}
