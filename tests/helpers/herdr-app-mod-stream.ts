import net from 'node:net';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { Terminal } from '@xterm/headless';
import { z } from 'zod';
import type { KeyboardView } from '../../src/domain/backend';

const reply = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number().int(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});
export function streamFrame(channel: number, kind: number, bytes: Buffer) {
  if (bytes.length > 1_000_000) throw Error('Prototype frame refused');
  const header = Buffer.alloc(9);
  header.writeUInt32LE(channel);
  header[4] = kind;
  header.writeUInt32LE(bytes.length, 5);
  return Buffer.concat([header, bytes]);
}

/** Test-only raw viewer. DATA is ordinary terminal input, never AUTOMATIC_INPUT.
 * A live attach supplies both screen and cursor; terminal.read alone cannot.
 * This does not claim conditional commit inside Core (see the prototype report).
 */
export class ModTerminalStream {
  private readonly terminal: Terminal;
  private socket?: net.Socket;
  private buffer = Buffer.alloc(0);
  private framed = false;
  private channel = 0;
  private id = 0;
  private address = '';
  private cursorVisible = true;
  private ended = false;
  ending: { reason?: string; exit_code?: number | null } | null = null;
  private received = 0;
  private parsed = Promise.resolve();
  private readonly pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  private readonly early: { channel: number; kind: number; data: Buffer }[] =
    [];
  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.terminal = new Terminal({
      cols,
      rows,
      scrollback: 0,
      allowProposedApi: true,
    });
    for (const [final, visible] of [
      ['h', true],
      ['l', false],
    ] as const)
      this.terminal.parser.registerCsiHandler(
        { prefix: '?', final },
        (params) => {
          if (params.includes(25)) this.cursorVisible = visible;
          return false;
        },
      );
  }
  async connect(
    file: string,
    terminal: string,
    coreId: string,
    peer: (socket: net.Socket) => Promise<void>,
  ) {
    if (this.socket || !/^t[1-9][0-9]*$/.test(terminal))
      throw Error('Prototype stream refused');
    const socket = (this.socket = net.createConnection(file));
    socket.on('error', () => this.fail());
    socket.on('close', () => this.fail());
    socket.on('data', (data) => {
      try {
        this.receive(typeof data === 'string' ? Buffer.from(data) : data);
      } catch {
        this.fail();
      }
    });
    await once(socket, 'connect');
    await peer(socket);
    const hello = z
      .object({ core: z.object({ id: z.string() }) })
      .parse(await this.rpc('hello', { generation: 1, framed: true }));
    if (hello.core.id !== coreId) throw Error('Prototype Core changed');
    const attached = z.object({ channel: z.number().int().positive() }).parse(
      await this.rpc('terminal.attach', {
        terminal,
        cols: this.cols,
        rows: this.rows,
        history: 0,
        observe: false,
      }),
    );
    this.channel = attached.channel;
    this.address = terminal;
    for (const frame of this.early.splice(0))
      this.accept(frame.channel, frame.kind, frame.data);
    const limit = Date.now() + 3000;
    while (!this.received) {
      this.assertOpen();
      if (Date.now() > limit) throw Error('Prototype paint unavailable');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await this.read();
  }
  private fail() {
    this.ended = true;
    for (const p of this.pending.values())
      p.reject(Error('Prototype stream ended'));
    this.pending.clear();
    this.socket?.destroy();
  }
  private receive(data: Buffer) {
    if (this.buffer.length + data.length > 2_000_000) throw Error();
    this.buffer = Buffer.concat([this.buffer, data]);
    if (!this.framed) {
      const end = this.buffer.indexOf(10);
      if (end < 0) return;
      this.acceptReply(this.buffer.subarray(0, end));
      this.buffer = this.buffer.subarray(end + 1);
      this.framed = true;
    }
    while (this.buffer.length >= 9) {
      const channel = this.buffer.readUInt32LE(0),
        kind = this.buffer[4];
      const length = this.buffer.readUInt32LE(5);
      if (length > 1_000_000) throw Error();
      if (this.buffer.length < length + 9) return;
      const payload = this.buffer.subarray(9, 9 + length);
      this.buffer = this.buffer.subarray(9 + length);
      if (channel === 0 && kind === 0) this.acceptReply(payload);
      else if (!this.channel) this.early.push({ channel, kind, data: payload });
      else this.accept(channel, kind, payload);
    }
  }
  private acceptReply(bytes: Buffer) {
    const message = reply.parse(JSON.parse(bytes.toString('utf8')));
    const pending = this.pending.get(message.id);
    if (!pending) throw Error();
    this.pending.delete(message.id);
    if (message.error || !Object.hasOwn(message, 'result'))
      pending.reject(Error('Prototype RPC refused'));
    else pending.resolve(message.result);
  }
  private accept(channel: number, kind: number, data: Buffer) {
    if (channel !== this.channel) throw Error();
    if (kind === 0) {
      this.received++;
      this.parsed = this.parsed.then(
        () =>
          new Promise<void>((resolve) => this.terminal.write(data, resolve)),
      );
      const credit = Buffer.alloc(4);
      credit.writeUInt32LE(data.length);
      this.socket!.write(streamFrame(channel, 1, credit));
    } else if (kind === 2) {
      this.ending = z
        .object({
          reason: z.string().max(80).optional(),
          exit_code: z.number().int().nullable().optional(),
        })
        .parse(JSON.parse(data.toString('utf8')));
      this.fail();
    } else throw Error('Prototype frame kind refused');
  }
  private async rpc(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 3000,
  ) {
    this.assertOpen();
    const id = ++this.id;
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    const bytes = Buffer.from(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    );
    this.socket!.write(
      this.framed
        ? streamFrame(0, 0, bytes)
        : Buffer.concat([bytes, Buffer.from('\n')]),
    );
    const timer = setTimeout(() => this.fail(), timeoutMs);
    try {
      return await result;
    } finally {
      clearTimeout(timer);
    }
  }
  assertOpen() {
    if (!this.socket || this.ended || this.socket.destroyed)
      throw Error('Prototype stream unavailable');
  }
  private view(): KeyboardView {
    const screen = this.terminal.buffer.active;
    const text = Array.from(
      { length: this.rows },
      (_, row) =>
        screen.getLine(screen.baseY + row)?.translateToString(true) ?? '',
    )
      .join('\n')
      .trimEnd();
    const cursor = this.cursorVisible
      ? { row: screen.cursorY + 1, column: screen.cursorX + 1 }
      : null;
    return {
      text,
      cursor,
      hash: createHash('sha256')
        .update(JSON.stringify([text, cursor]))
        .digest('hex'),
    };
  }
  async read(): Promise<KeyboardView> {
    this.assertOpen();
    // Let the owned CLI's frame following a write arrive; never send a probe key.
    await new Promise((resolve) => setTimeout(resolve, 35));
    await this.parsed;
    this.assertOpen();
    return this.view();
  }
  current(): KeyboardView {
    this.assertOpen();
    return this.view();
  }
  async finalView(): Promise<KeyboardView> {
    await this.parsed;
    return this.view();
  }
  write(bytes: Buffer) {
    this.assertOpen();
    this.socket!.write(streamFrame(this.channel, 0, bytes));
  }
  /** Test-only bounded competitor. Its first and final bytes let the owned
   * recorder prove when Core has entered and drained its per-terminal gate. */
  async probeKeySequence(pauses: number) {
    if (!Number.isInteger(pauses) || pauses < 1 || pauses > 160)
      throw Error('Probe sequence refused');
    return this.rpc(
      'terminal.keys',
      {
        terminal: this.address,
        keys: ['a', ...Array<string>(pauses).fill('b'), 'c'],
      },
      8000,
    );
  }
  /** Core processes viewer DATA synchronously before dispatching this next
   * request on the same connection. A reply fences preceding viewer input. */
  async probeInputBarrier() {
    return this.rpc('terminal.get', { terminal: this.address });
  }
  async probeQueuedKey() {
    return this.rpc(
      'terminal.keys',
      { terminal: this.address, keys: ['f'] },
      8000,
    );
  }
  close() {
    this.socket?.destroy();
    this.terminal.dispose();
  }
}
