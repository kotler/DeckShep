import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { WebSocketServer, type WebSocket } from 'ws';

export interface HostFrame {
  event: string;
  context?: string;
  uuid?: string;
  action?: string;
  device?: string;
  payload?: Record<string, unknown>;
}
export type FixtureMessage = Record<string, unknown>;
const pluginId = 'com.kotl3r.deckshep';

/** A private Stream Deck protocol peer. It can launch only the fixture bundle
 * it creates, with a temporary HOME and no inherited agent routing or auth. */
class VirtualHost {
  readonly frames: HostFrame[] = [];
  readonly input: FixtureMessage[] = [];
  readonly plugin: string;
  child?: ChildProcess;
  errors = '';
  private server?: WebSocketServer;
  private socket?: WebSocket;
  private stopped = false;
  private commandId = 0;

  readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
    this.plugin = path.join(directory, pluginId + '.sdPlugin');
  }

  async start(): Promise<void> {
    if (this.child || this.stopped) throw Error('Virtual host already used');
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    this.server = server;
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw Error('Host port unavailable');
    const connected = once(server, 'connection');
    const info = {
      application: {
        version: '6.8.0',
        language: 'en',
        platform: 'mac',
        platformVersion: '15.0',
      },
      plugin: { uuid: pluginId, version: '1.3.4.0' },
      devicePixelRatio: 2,
      devices: [
        {
          id: 'fixture-device',
          name: 'Fixture',
          size: { columns: 5, rows: 3 },
          type: 0,
        },
      ],
    };
    const child = fork(
      path.join(this.plugin, 'bin/plugin.js'),
      [
        '-port',
        String(address.port),
        '-pluginUUID',
        pluginId,
        '-registerEvent',
        'registerPlugin',
        '-info',
        JSON.stringify(info),
      ],
      {
        cwd: this.plugin,
        execArgv: [],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { PATH: process.env.PATH, HOME: this.directory },
      },
    );
    this.child = child;
    child.stderr?.on('data', (data: Buffer) => {
      this.errors += data.toString();
    });
    child.on('message', (message: unknown) => {
      if (message && typeof message === 'object' && !Array.isArray(message))
        this.input.push(message as FixtureMessage);
    });
    this.socket = (await connected)[0] as WebSocket;
    this.socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as HostFrame;
      this.frames.push(frame);
      if (frame.event === 'getGlobalSettings')
        this.sendFrame({
          event: 'didReceiveGlobalSettings',
          payload: {
            settings: {
              version: 2,
              revision: 0,
              shared: {},
              profiles: { rex: {}, herdr: {} },
            },
          },
        });
    });
  }

  sendFrame(frame: HostFrame): void {
    if (!this.socket) throw Error('Virtual host not connected');
    this.socket.send(JSON.stringify(frame));
  }

  send(
    event: string,
    index: number,
    extra: Record<string, unknown> = {},
  ): void {
    this.sendFrame({
      event,
      action: pluginId + '.key',
      context: 'key-' + index,
      device: 'fixture-device',
      payload: {
        controller: 'Keypad',
        coordinates: { column: index % 5, row: Math.floor(index / 5) },
        settings: { profileScope: 'rex' },
        state: 0,
        isInMultiAction: false,
        ...extra,
      },
    });
  }

  async until(predicate: () => boolean): Promise<void> {
    const end = Date.now() + 5000;
    while (!predicate()) {
      if (this.child?.exitCode !== null)
        throw Error('Bundled plugin exited: ' + this.errors);
      if (Date.now() > end) throw Error('Host event timeout: ' + this.errors);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async command(command: string, value?: unknown): Promise<FixtureMessage> {
    if (!this.child?.connected) throw Error('Fixture child unavailable');
    const id = ++this.commandId;
    this.child.send({ command, value, id });
    await this.until(() =>
      this.input.some((m) => m.kind === 'fixtureAck' && m.id === id),
    );
    const ack = this.input.find((m) => m.kind === 'fixtureAck' && m.id === id)!;
    if (ack.error) throw Error(String(ack.error));
    return ack;
  }

  /** A host-protocol round trip queued after any preceding key events. */
  async settled(index = 0): Promise<HostFrame> {
    const start = this.frames.length;
    this.send('propertyInspectorDidAppear', index);
    this.send('sendToPlugin', index, { kind: 'status' });
    await this.until(() =>
      this.frames
        .slice(start)
        .some((f) => f.event === 'sendToPropertyInspector'),
    );
    return this.frames
      .slice(start)
      .find((f) => f.event === 'sendToPropertyInspector')!;
  }

  closeSocket(): void {
    this.socket?.close();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.socket?.terminate();
    for (const client of this.server?.clients ?? []) client.terminate();
    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      const timer = setTimeout(() => child.kill('SIGKILL'), 1000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    if (this.server)
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    fs.rmSync(this.directory, { recursive: true, force: true });
  }
}

export async function prepareVirtualHost({
  fixture = 'tests/integration/host/dependencies.ts',
} = {}): Promise<VirtualHost> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deckshep-host-'));
  const host = new VirtualHost(directory);
  try {
    fs.mkdirSync(path.join(host.plugin, 'bin'), { recursive: true });
    for (const name of ['manifest.json', 'config.json', 'assets'])
      fs.cpSync(
        path.resolve(pluginId + '.sdPlugin', name),
        path.join(host.plugin, name),
        { recursive: true },
      );
    const { bundle } = await import('../../../scripts/bundle.mjs');
    await bundle(
      path.resolve('src/plugin/entry.mts'),
      path.join(host.plugin, 'bin/plugin.js'),
      { fixture: path.resolve(fixture) },
    );
    return host;
  } catch (error) {
    await host.stop();
    throw error;
  }
}
