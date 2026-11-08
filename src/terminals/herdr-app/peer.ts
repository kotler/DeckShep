import type { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import type { AppFocusRecord } from '../../domain/app-focus-request';
import { validate } from '../../schemas';
import { inspectAppBuild, type PlistDecoder } from './build-files';

export type AppPeerProbe = (
  socket: Socket,
  signal?: AbortSignal,
) => Promise<unknown>;
export interface AppPeerBinding {
  readonly key: string;
  readonly recordKey: string;
  assertUnchanged(): void;
}
// Source inspection and fixtures cannot authorize a production App build.
export const APP_FOCUS_RECORDS: readonly AppFocusRecord[] = Object.freeze([]);

export class AppPeerVerifier {
  readonly #records: AppFocusRecord[];
  constructor(
    private readonly probe: AppPeerProbe,
    records: readonly AppFocusRecord[] = APP_FOCUS_RECORDS,
    private readonly decoder?: PlistDecoder,
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
    if (!this.#records.length) throw Error('Build mismatch');
  }
  async verify(
    socket: Socket,
    endpoint: string,
    signal?: AbortSignal,
  ): Promise<AppPeerBinding> {
    try {
      this.assertConfigured();
      if (signal?.aborted) throw Error();
      const before = validate('herdrAppPeer', await this.probe(socket, signal));
      if (before.uid !== process.getuid?.()) throw Error();
      const build = await inspectAppBuild(before.executable, this.decoder),
        after = validate('herdrAppPeer', await this.probe(socket, signal));
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
      if (matches.length !== 1) throw Error();
      return Object.freeze({
        key: createHash('sha256')
          .update(JSON.stringify([endpoint, before, matches[0].key]))
          .digest('hex'),
        recordKey: matches[0].key,
        assertUnchanged: build.assertUnchanged,
      });
    } catch {
      throw Error('Peer unverified');
    }
  }
}
