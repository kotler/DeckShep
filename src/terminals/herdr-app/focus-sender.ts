import type {
  AppFocusPermit,
  AppFocusLease,
} from '../../domain/app-focus-request';
import type { AppPaneRef } from '../../domain/app-selection';
import { AppFocusAuthority } from '../../guards/app-focus-request';
import { parse, validate, type Boundary, type schemas } from '../../schemas';
import type { z } from 'zod';
import { appSocket, type AppHomeOptions } from './endpoint';
import { createConnection, type Socket } from 'node:net';
import { inspectSocket, type SocketEndpoint } from './endpoint';
import { AppPeerVerifier, type AppPeerBinding } from './peer';
import { AppSelectionReader } from './selection';

type Data<K extends Boundary> = z.infer<(typeof schemas)[K]>;
type Request =
  | { status: true }
  | { ls: true }
  | { commands: true }
  | { do: 'pane.focus'; args: { pane: string } };
function sameTarget(left: AppPaneRef, right: AppPaneRef): boolean {
  return ['space', 'tab', 'pane', 'terminal'].every(
    (key) => left[key as keyof AppPaneRef] === right[key as keyof AppPaneRef],
  );
}
function assertCommand(value: Data<'herdrAppCommands'>): void {
  const commands = value.filter((command) => command.name === 'pane.focus');
  if (
    commands.length !== 1 ||
    commands[0].args.length !== 2 ||
    !['pane', 'terminal'].every(
      (name) =>
        commands[0].args.filter(
          (arg) => arg.name === name && arg.required === false,
        ).length === 1,
    )
  )
    throw Error('Build mismatch');
}

/** Internal framing only. This module never writes to the socket. The sender
 * retains its write edge so it can consume the request lease immediately there. */
class AppFocusConnection {
  readonly socket: Socket;
  readonly endpoint: SocketEndpoint;
  #failed = false;
  #complete = false;
  #buffer = Buffer.alloc(0);
  #reject: ((error: Error) => void) | null = null;
  #resolve: ((line: string) => void) | null = null;
  #removeAbort: () => void;
  constructor(file: string, signal: AbortSignal) {
    this.endpoint = inspectSocket(file);
    // Keep our descriptor until post-checks finish, even if the server sends FIN.
    this.socket = createConnection({ path: file, allowHalfOpen: true });
    const abort = () => this.fail();
    signal.addEventListener('abort', abort, { once: true });
    this.#removeAbort = () => signal.removeEventListener('abort', abort);
    this.socket.on('error', abort);
    this.socket.on('close', abort);
    this.socket.on('end', () => {
      if (!this.#complete) this.fail();
    });
    this.socket.on('data', (bytes: Buffer) => this.receive(bytes));
    if (signal.aborted) this.fail();
  }
  async open(): Promise<void> {
    this.assertCurrent();
    if (!this.socket.connecting) return;
    await new Promise<void>((resolve, reject) => {
      this.#reject = reject;
      this.socket.once('connect', () => {
        this.#reject = null;
        resolve();
      });
    });
    this.assertCurrent();
  }
  response(): Promise<string> {
    this.assertCurrent();
    return new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }
  assertCurrent(): void {
    if (
      this.#failed ||
      this.socket.destroyed ||
      inspectSocket(this.endpoint.file).identity !== this.endpoint.identity
    )
      throw Error('App changed');
  }
  private receive(bytes: Buffer): void {
    try {
      if (
        !this.#resolve ||
        this.#complete ||
        this.#buffer.length + bytes.length > 1000000
      )
        throw Error();
      this.#buffer = Buffer.concat([this.#buffer, bytes]);
      const end = this.#buffer.indexOf(10);
      if (end < 0) return;
      if (end !== this.#buffer.length - 1) throw Error();
      const line = new TextDecoder('utf-8', { fatal: true }).decode(
        this.#buffer.subarray(0, end),
      );
      this.assertCurrent();
      this.#complete = true;
      this.#buffer = Buffer.alloc(0);
      this.#resolve(line);
      this.#resolve = this.#reject = null;
    } catch {
      this.fail();
    }
  }
  fail(): void {
    this.#failed = true;
    this.#reject?.(Error('App unavailable'));
    this.#resolve = this.#reject = null;
    this.socket.destroy();
  }
  close(): void {
    this.#removeAbort();
    this.fail();
    this.#buffer = Buffer.alloc(0);
  }
}

/** Unwired request-only backend. No provider input, OS activation or verified
 * focus operation can be expressed here. Production build records stay empty. */
export class GuardedAppFocusSender {
  readonly #file: string;
  readonly #active = new Set<AppFocusConnection>();
  readonly #reader: AppSelectionReader;
  readonly #verifier: AppPeerVerifier;
  readonly #authority: AppFocusAuthority;
  #binding: AppPeerBinding | null = null;
  #disposed = false;
  #delivering = false;
  #generation = 0;
  constructor(
    verifier: AppPeerVerifier,
    authority: AppFocusAuthority,
    options: AppHomeOptions & { appHome: string },
  ) {
    if (!options?.appHome) throw Error('App unavailable');
    this.#verifier = verifier;
    this.#authority = authority;
    this.#file = appSocket(options);
    this.#reader = new AppSelectionReader(this);
  }
  get generation(): number {
    return this.#generation;
  }
  get peerKey(): string {
    return this.#binding?.key ?? '';
  }
  get recordKey(): string {
    return this.#binding?.recordKey ?? '';
  }
  status(signal?: AbortSignal): Promise<Data<'herdrAppStatus'>> {
    return this.#exchange({ status: true }, 'herdrAppStatus', signal);
  }
  ls(signal?: AbortSignal): Promise<Data<'herdrAppWorld'>> {
    return this.#exchange({ ls: true }, 'herdrAppWorld', signal);
  }
  commands(signal?: AbortSignal): Promise<Data<'herdrAppCommands'>> {
    return this.#exchange({ commands: true }, 'herdrAppCommands', signal);
  }
  observe(signal?: AbortSignal) {
    return this.#reader.read(signal);
  }
  async deliver(input: unknown, permit: AppFocusPermit, signal?: AbortSignal) {
    const lease = this.#authority.begin(permit);
    validate('herdrAppFocusInput', input);
    if (this.#delivering || this.#disposed) throw Error('Request pending');
    const bounded = AbortSignal.any([
      AbortSignal.timeout(1000),
      ...(signal ? [signal] : []),
    ]);
    this.#delivering = true;
    let dispatched = false;
    try {
      this.#assertLease(lease);
      assertCommand(await this.commands(bounded));
      this.#assertLease(lease);
      const snapshot = await this.observe(bounded);
      this.#assertLease(lease);
      if (
        snapshot.panes.filter(({ target }) =>
          sameTarget(target, lease.context.target),
        ).length !== 1
      )
        throw Error('Request stale');
      const reply = await this.#exchange(
        { do: 'pane.focus', args: { pane: lease.context.target.pane } },
        'herdrAppFocusReply',
        bounded,
        lease,
        () => {
          dispatched = true;
        },
      );
      if (!('ok' in reply)) throw Error();
      lease.postflight();
      return { status: 'requested' as const, verifiedFocus: false as const };
    } catch {
      throw Error(dispatched ? 'Focus uncertain' : 'Focus refused');
    } finally {
      this.#delivering = false;
    }
  }
  #assertLease(lease: AppFocusLease): void {
    lease.check();
    if (
      this.peerKey !== lease.context.peerKey ||
      this.recordKey !== lease.context.recordKey ||
      this.generation !== lease.context.endpointGeneration
    )
      throw Error('App changed');
  }
  #adopt(binding: AppPeerBinding): void {
    if (this.#disposed) throw Error('App unavailable');
    if (this.#binding && this.#binding.key !== binding.key)
      throw Error('App changed');
    if (!this.#binding) this.#generation++;
    this.#binding = binding;
  }
  async #exchange<K extends Boundary>(
    request: Request,
    schema: K,
    signal?: AbortSignal,
    lease?: AppFocusLease,
    onDispatch?: () => void,
  ): Promise<Data<K>> {
    this.#verifier.assertConfigured();
    if (this.#disposed) throw Error('App unavailable');
    const bounded = AbortSignal.any([
      AbortSignal.timeout(1000),
      ...(signal ? [signal] : []),
    ]);
    if (bounded.aborted) throw Error('App unavailable');
    const channel = new AppFocusConnection(this.#file, bounded);
    this.#active.add(channel);
    try {
      await channel.open();
      const binding = await this.#verifier.verify(
        channel.socket,
        channel.endpoint.identity,
        bounded,
      );
      channel.assertCurrent();
      this.#adopt(binding);
      binding.assertUnchanged();
      if ('do' in request && !lease) throw Error('Focus refused');
      const response = channel.response();
      // No await between final identity/press/consent checks and this sole write.
      try {
        if (lease)
          lease.consume(binding.key, binding.recordKey, this.generation);
        binding.assertUnchanged();
        channel.assertCurrent();
        onDispatch?.();
        channel.socket.write(JSON.stringify(request) + '\n', (error) => {
          if (error) channel.fail();
        });
      } catch {
        channel.fail();
      }
      const line = await response;
      const after = await this.#verifier.verify(
        channel.socket,
        channel.endpoint.identity,
        bounded,
      );
      channel.assertCurrent();
      if (bounded.aborted || after.key !== binding.key)
        throw Error('App changed');
      after.assertUnchanged();
      return parse(schema, line);
    } catch {
      this.#binding = null;
      this.#generation++;
      throw Error('App unavailable');
    } finally {
      channel.close();
      this.#active.delete(channel);
    }
  }
  dispose(): void {
    this.#disposed = true;
    this.#binding = null;
    this.#generation++;
    for (const channel of this.#active) channel.close();
    this.#active.clear();
  }
}
