import type { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import type { AppFocusRecord } from '../../domain/app-focus-request';
import { validate } from '../../schemas';
import { inspectAppBuild, type PlistDecoder } from './build-files';
import type {
  PeerSessionFactory,
  NativePeerSession,
} from '../../platform/app-peer-session';

export type AppPeerProbe = (
  socket: Socket,
  signal?: AbortSignal,
) => Promise<unknown>;
export interface AppPeerBinding {
  readonly key: string;
  readonly recordKey: string;
  assertUnchanged(): void;
}
export interface AppPeerConnection {
  readonly binding: AppPeerBinding;
  finish(): Promise<void>;
  dispose(): Promise<void>;
}
// Source inspection and fixtures cannot authorize a production App build.
export const APP_FOCUS_RECORDS: readonly AppFocusRecord[] = Object.freeze([]);

export class AppPeerVerifier {
  readonly #records: AppFocusRecord[];
  #lastBuild?: {
    file: string;
    image: Awaited<ReturnType<typeof inspectAppBuild>>;
  };
  constructor(
    private readonly probe: AppPeerProbe,
    records: readonly AppFocusRecord[] = APP_FOCUS_RECORDS,
    private readonly decoder?: PlistDecoder,
    private readonly sessions?: PeerSessionFactory,
    private readonly verifyPublisher?: (
      executable: string,
      cdHash: string,
      binarySha256: string,
      plistSha256: string,
    ) => Promise<void>,
  ) {
    this.#records = records.map((record) =>
      validate('herdrAppFocusRecord', record),
    );
    if (
      new Set(this.#records.map((record) => record.key)).size !== records.length
    )
      throw Error('Build mismatch');
  }
  assertConfigured(): void {
    if (!this.#records.length && !(this.sessions && this.verifyPublisher))
      throw Error('Build mismatch');
  }
  async open(
    socket: Socket,
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<AppPeerConnection> {
    this.assertConfigured();
    // Legacy injected probes keep their fresh post-reply verification. Only an
    // explicit session factory can retain kernel evidence across server close.
    if (!this.sessions) {
      const binding = await this.verify(socket, endpoint, signal);
      return {
        binding,
        finish: async () => {
          const after = await this.verify(socket, endpoint, signal);
          if (after.key !== binding.key) throw Error('Peer unverified');
          after.assertUnchanged();
        },
        dispose: async () => {},
      };
    }
    let session: NativePeerSession | undefined;
    try {
      session = await this.sessions(socket, signal);
      const before = validate('herdrAppPeer', session.captured);
      const binding = await this.#inspect(
        socket,
        endpoint,
        signal,
        async () => before,
        false,
      );
      const checked = validate('herdrAppPeer', await session.check());
      if (JSON.stringify(before) !== JSON.stringify(checked) || signal?.aborted)
        throw Error();
      binding.assertUnchanged();
      const owned = session;
      let spent = false;
      return Object.freeze({
        binding,
        async finish() {
          if (spent) throw Error('Peer unverified');
          spent = true;
          const after = validate('herdrAppPeer', await owned.finish());
          if (
            signal?.aborted ||
            socket.destroyed ||
            JSON.stringify(before) !== JSON.stringify(after)
          )
            throw Error('Peer unverified');
          binding.assertUnchanged();
        },
        async dispose() {
          spent = true;
          await owned.dispose();
        },
      });
    } catch {
      await session?.dispose();
      throw Error('Peer unverified');
    }
  }
  async verify(
    socket: Socket,
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<AppPeerBinding> {
    return this.#inspect(socket, endpoint, signal, this.probe, true);
  }
  async #inspect(
    socket: Socket,
    endpoint: string,
    signal: AbortSignal | undefined,
    probe: AppPeerProbe = this.probe,
    repeat = true,
  ): Promise<AppPeerBinding> {
    try {
      this.assertConfigured();
      if (signal?.aborted) throw Error();
      const before = validate('herdrAppPeer', await probe(socket, signal));
      if (before.uid !== process.getuid?.()) throw Error();
      // Only reuse the captured file hashes. Kernel peer evidence, approved
      // identity and the tracked filesystem stamps are checked each exchange.
      const build =
          this.#lastBuild?.file === before.executable
            ? this.#lastBuild.image
            : await inspectAppBuild(before.executable, this.decoder),
        after = repeat
          ? validate('herdrAppPeer', await probe(socket, signal))
          : before;
      if (signal?.aborted || JSON.stringify(before) !== JSON.stringify(after))
        throw Error();
      build.assertUnchanged();
      const matches = this.#records.filter(
        (record) =>
          record.cdHash === before.cdHash &&
          record.bundleId === build.bundleId &&
          record.executable === build.executable &&
          record.version === build.version &&
          record.build === build.build &&
          record.executableSha256 === build.executableSha256 &&
          record.plistSha256 === build.plistSha256,
      );
      let recordKey = matches[0]?.key;
      if (!matches.length && this.verifyPublisher && this.sessions) {
        await this.verifyPublisher(
          before.executable,
          before.cdHash,
          build.executableSha256,
          build.plistSha256,
        );
        if (signal?.aborted) throw Error();
        build.assertUnchanged();
        recordKey = 'herdr-signed-' + before.cdHash;
      } else if (matches.length !== 1) throw Error();
      this.#lastBuild = { file: before.executable, image: build };
      return Object.freeze({
        key: createHash('sha256')
          .update(JSON.stringify([endpoint, before, recordKey]))
          .digest('hex'),
        recordKey,
        assertUnchanged: build.assertUnchanged,
      });
    } catch {
      this.#lastBuild = undefined;
      throw Error('Peer unverified');
    }
  }
}
