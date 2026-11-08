import type { AppPaneRef, AppSelectionSnapshot } from './app-selection';

declare const requestPermit: unique symbol;
/** Deliberately incompatible with provider/verified-focus delivery permits. */
export interface AppFocusPermit {
  readonly [requestPermit]: true;
}
export interface AppFocusContext {
  scope: 'herdr-app';
  control: 'requestFocus';
  appearance: number;
  visibility: number;
  generation: number;
  backendKey: string;
  page: number;
  stamp: string;
  armedAt: number;
  pressedAt: number;
  endpointGeneration: number;
  peerKey: string;
  recordKey: string;
  target: AppPaneRef;
}
export interface AppFocusState extends Omit<
  AppFocusContext,
  'pressedAt' | 'target'
> {
  target: AppPaneRef | null;
  visible: boolean;
  setupBusy: boolean;
  focusRequestEnabled: boolean;
}
export interface AppFocusLease {
  readonly context: Readonly<AppFocusContext>;
  check(): void;
  consume(peerKey: string, recordKey: string, generation: number): void;
  postflight(): void;
}
/** Composition port shared by the real sender and isolated test backends. */
export interface AppFocusPort {
  readonly generation: number;
  readonly peerKey: string;
  readonly recordKey: string;
  observe(signal?: AbortSignal): Promise<AppSelectionSnapshot>;
  deliver(
    input: { kind: 'requestFocus' },
    permit: AppFocusPermit,
    signal?: AbortSignal,
  ): Promise<{
    status: 'requested';
    verifiedFocus: false;
  }>;
  dispose(): void;
}
/** Exact request-only build contract; not a native-focus verification record. */
export interface AppFocusRecord {
  key: string;
  contract: 1;
  bundleId: 'dev.herdr.app';
  executable: 'Herdr';
  version: string;
  build: string;
  executableSha256: string;
  plistSha256: string;
  cdHash: string;
}
