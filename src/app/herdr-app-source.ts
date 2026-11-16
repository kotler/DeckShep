import type { AppFocusPort } from '../domain/app-focus-request';
import type { AppSelectionSnapshot } from '../domain/app-selection';
import type { Config } from '../domain/types';
import type { AppFocusAuthority } from '../guards/app-focus-request';
import type { AppFocusBackendFactory } from './herdr-app-backend';

export interface AppSelectionObserver {
  observe(signal?: AbortSignal): Promise<AppSelectionSnapshot>;
  dispose(): void;
}
export interface AppSourceStamp {
  readonly sourceId: number;
  readonly endpointGeneration: number;
  readonly peerKey: string;
  readonly recordKey: string;
}
export type AppSourceChange =
  | { kind: 'observed'; snapshot: AppSelectionSnapshot }
  | { kind: 'suspended' }
  | { kind: 'retired' };

interface Options {
  config(): Config;
  backend: AppFocusBackendFactory;
  authority: AppFocusAuthority;
  reader?: (config: Config) => AppSelectionObserver;
  changed(change: AppSourceChange): void;
}
interface Poll {
  promise: Promise<void>;
  finish(): void;
}
function changingView(error: unknown) {
  return (
    error instanceof Error &&
    [
      'App selection changed',
      'App selection ambiguous',
      'App view unavailable',
    ].includes(error.message)
  );
}
async function wait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([work, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

/** Owns the current App readers and read completion lifetime (ADR 0008). */
export class HerdrAppSource {
  #port: AppFocusPort | null = null;
  #observer: AppSelectionObserver | null = null;
  #snapshot: AppSelectionSnapshot | null = null;
  #epoch = 0;
  #sourceId = 0;
  #lifetime = new AbortController();
  #poll: Poll | null = null;

  constructor(private readonly options: Options) {}

  get snapshot() {
    return this.#snapshot;
  }
  get pending() {
    return this.#poll?.promise;
  }
  get stamp(): AppSourceStamp {
    return {
      sourceId: this.#sourceId,
      endpointGeneration:
        this.#port?.generation ?? this.#snapshot?.endpointGeneration ?? 0,
      peerKey: this.#port?.peerKey ?? '',
      recordKey: this.#port?.recordKey ?? '',
    };
  }
  get hasPort() {
    return this.#port !== null;
  }
  get verified() {
    return (
      !!this.#snapshot &&
      !!this.#port?.peerKey &&
      this.#snapshot.endpointGeneration === this.#port.generation &&
      this.#focusCapable()
    );
  }
  #focusCapable() {
    return (
      this.options.backend.recordCount > 0 &&
      this.options.backend.helperAvailable()
    );
  }

  matches(stamp: AppSourceStamp) {
    const current = this.stamp;
    return (
      !!this.#snapshot &&
      stamp.sourceId === current.sourceId &&
      stamp.endpointGeneration === current.endpointGeneration &&
      stamp.peerKey === current.peerKey &&
      stamp.recordKey === current.recordKey &&
      (!this.#port || this.verified)
    );
  }
  check(): boolean {
    if (this.#snapshot && this.#port && !this.verified) {
      this.retire();
      return false;
    }
    return true;
  }
  #assertSource(sourceId: number) {
    if (sourceId !== this.#sourceId || !(this.#port ?? this.#observer))
      throw Error('Request stale');
  }

  #retireReaders() {
    const port = this.#port,
      observer = this.#observer;
    this.#port = null;
    this.#observer = null;
    this.#snapshot = null;
    this.#epoch = 0;
    this.#sourceId++;
    this.#lifetime.abort(Error('Request stale'));
    this.#lifetime = new AbortController();
    port?.dispose();
    observer?.dispose();
    this.options.changed({ kind: 'retired' });
  }
  retire() {
    const poll = this.#poll;
    this.#poll = null;
    this.#retireReaders();
    poll?.finish();
  }
  suspend() {
    this.#snapshot = null;
    this.options.changed({ kind: 'suspended' });
  }

  poll(retryVerification = false): Promise<void> {
    if (this.#poll) return this.#poll.promise;
    if (
      (retryVerification && this.#observer && this.#focusCapable()) ||
      (this.#port && !this.#focusCapable())
    )
      this.retire();
    let finish!: () => void;
    const promise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const poll = { promise, finish };
    this.#poll = poll;
    void this.#runPoll(poll);
    return promise;
  }
  async #runPoll(poll: Poll) {
    try {
      await this.#read(poll);
    } finally {
      if (this.#poll === poll) this.#poll = null;
      poll.finish();
    }
  }
  #publish(snapshot: AppSelectionSnapshot) {
    this.accept(this.#sourceId, snapshot);
    this.options.changed({ kind: 'observed', snapshot });
  }
  async #read(poll: Poll) {
    try {
      if (!this.#observer && this.#focusCapable()) {
        try {
          const port = (this.#port ??= this.options.backend.create(
            this.options.config(),
            this.options.authority,
          ));
          const snapshot = await port.observe(this.#lifetime.signal);
          if (this.#poll !== poll || this.#port !== port) return;
          this.#publish(snapshot);
          return;
        } catch (error) {
          if (this.#poll !== poll) return;
          if (
            changingView(error) &&
            this.#port?.peerKey &&
            this.#port.generation === this.#epoch
          ) {
            this.suspend();
            return;
          }
          const fallback =
            error instanceof Error &&
            ['App unavailable', 'Build mismatch', 'Peer unverified'].includes(
              error.message,
            );
          if (this.#epoch) {
            // An established source expires immediately. Any fallback owns a new
            // poll, so the retired poll cannot clear it or hold its callers.
            this.retire();
            if (fallback && this.options.reader) {
              this.#observer = this.options.reader(this.options.config());
              void this.poll();
            }
            return;
          }
          // Opening the first source may try both readers before it can publish
          // a view. There is no displayed source to invalidate during this probe.
          this.#retireReaders();
          if (this.#poll !== poll || !fallback) return;
        }
      }
      const reader = (this.#observer ??=
        this.options.reader?.(this.options.config()) ?? null);
      if (!reader) return;
      const snapshot = await reader.observe(this.#lifetime.signal);
      if (this.#poll !== poll || this.#observer !== reader) return;
      this.#publish(snapshot);
    } catch (error) {
      if (this.#poll !== poll) return;
      if (this.#observer && changingView(error)) this.suspend();
      else this.retire();
    }
  }

  async waitForPoll(sourceId: number, signal: AbortSignal) {
    this.#assertSource(sourceId);
    if (signal.aborted) throw Error('Request expired');
    const lifetime = this.#lifetime.signal;
    try {
      if (this.#poll)
        await wait(this.#poll.promise, AbortSignal.any([lifetime, signal]));
    } catch {
      if (lifetime.aborted) throw Error('Request stale');
      throw Error('Request expired');
    }
    this.#assertSource(sourceId);
    if (signal.aborted) throw Error('Request expired');
  }
  async readForPress(
    sourceId: number,
    signal: AbortSignal,
  ): Promise<AppSelectionSnapshot> {
    this.#assertSource(sourceId);
    if (signal.aborted) throw Error('App read expired');
    const lifetime = this.#lifetime.signal;
    const bounded = AbortSignal.any([lifetime, signal]);
    try {
      await this.waitForPoll(sourceId, signal);
      this.#assertSource(sourceId);
      if (signal.aborted) throw Error('App read expired');
      const reader = (this.#port ?? this.#observer)!;
      const fresh = await wait(reader.observe(bounded), bounded);
      this.#assertSource(sourceId);
      if (signal.aborted) throw Error('App read expired');
      return fresh;
    } catch (error) {
      if (lifetime.aborted) throw Error('Request stale');
      if (
        signal.aborted ||
        (error instanceof Error && error.message === 'App read expired')
      )
        throw Error('App read expired');
      throw Error('App view unavailable');
    }
  }
  portForPress(sourceId: number): AppFocusPort {
    this.#assertSource(sourceId);
    if (!this.#port || !this.verified) throw Error('Focus refused');
    return this.#port;
  }
  accept(sourceId: number, snapshot: AppSelectionSnapshot) {
    this.#assertSource(sourceId);
    this.#snapshot = snapshot;
    this.#epoch = snapshot.endpointGeneration;
  }
}
