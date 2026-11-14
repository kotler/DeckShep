import { createHash } from 'node:crypto';
import type { Config } from '../domain/types';
import type { AppFocusPort, AppFocusState } from '../domain/app-focus-request';
import type { AppPaneRef, AppSelectionSnapshot } from '../domain/app-selection';
import type { AppCoreStatusPort } from '../terminals/herdr-app/core-status';
import { AppFocusAuthority } from '../guards/app-focus-request';
import type { AppFocusBackendFactory } from './herdr-app-backend';
import { appInspectorRequest } from './herdr-app-inspector';
import type { FrameCache } from '../render/frame';
import {
  appRoster,
  appProvider,
  destinationName,
  matchesAppTarget,
  paneKey,
  type AppTargetConditions,
} from '../domain/app-navigation';
import {
  defaultAppAction,
  appTile,
  type AppKey,
  type AppPresentation,
} from './herdr-app-view';

interface Options {
  config(): Config;
  view(config: Config): Record<string, unknown>;
  save(patch: unknown): void;
  emit(event: string, context: string, payload: Record<string, unknown>): void;
  frames: FrameCache;
  queueStaleMs: number;
  clock(): number;
  nextGeneration(): number;
  enqueue(work: () => Promise<void>): void;
  settled(): Promise<void>;
  backend: AppFocusBackendFactory;
  /** Read-only App selection used when no approved focus build exists. */
  reader?: (config: Config) => AppSelectionObserver;

  /** Optional Core readback for the inspector. */
  core?: (config: Config) => AppCoreStatusPort | null;
}
export interface AppSelectionObserver {
  observe(signal?: AbortSignal): Promise<AppSelectionSnapshot>;
  dispose(): void;
}
async function waitForPoll(poll: Promise<void>, signal: AbortSignal) {
  let expire = () => {};
  const deadline = new Promise<never>((_, reject) => {
    expire = () => reject(Error('Request expired'));
    signal.addEventListener('abort', expire, { once: true });
  });
  try {
    await Promise.race([poll, deadline]);
  } finally {
    signal.removeEventListener('abort', expire);
  }
}
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
/** App panes never enter provider-bound AgentSnapshot or the legacy dispatcher. */
export class HerdrAppController {
  readonly keys = new Map<string, AppKey>();
  readonly #authority: AppFocusAuthority;
  #config: Config;
  #backendKey = '';
  #generation: number;
  #visibility = 0;
  #appearance = 0;
  #port: AppFocusPort | null = null;
  #observer: AppSelectionObserver | null = null;
  #snapshot: AppSelectionSnapshot | null = null;
  #coreReader: AppCoreStatusPort | null = null;
  #roster = appRoster([], null, null);
  #coreCount: number | undefined;
  #coreReading: AppCoreStatusPort | null = null;
  #slots: AppPaneRef[] = [];
  #selection: AppPaneRef | null = null;
  #bank = 0;
  #refreshing: Promise<void> | null = null;
  #layoutStamp = '';
  #active: string | null = null;
  #settingsError = false;
  #message = '';
  constructor(private readonly options: Options) {
    this.#config = options.config();
    this.#generation = options.nextGeneration();
    this.#backendKey = digest(this.#config.herdrApp);
    this.#authority = new AppFocusAuthority(() => this.#state(), options.clock);
  }
  get bridge() {
    return this;
  }
  get config() {
    return this.#config;
  }
  get generation() {
    return this.#generation;
  }
  get setupBusy() {
    return this.#settingsError;
  }
  getPage() {
    return 0;
  }
  getBank() {
    return this.#bank;
  }
  setBank(value: number) {
    this.#bank = Math.max(0, Math.min(Math.floor(value), this.#banks() - 1));
  }
  settled() {
    return this.options.settled();
  }
  ready() {
    return this.settled();
  }
  refreshMetadata() {
    return Promise.resolve();
  }
  selected() {
    return this.#selection ?? this.#snapshot?.selected ?? null;
  }
  #banks() {
    return Math.max(1, Math.ceil(this.#slots.length / 5));
  }
  #focusCapable() {
    return (
      this.options.backend.recordCount > 0 &&
      this.options.backend.helperAvailable()
    );
  }
  #online() {
    return (
      !!this.#snapshot &&
      !!this.#port?.peerKey &&
      this.#snapshot.endpointGeneration === this.#port.generation &&
      this.options.backend.recordCount > 0 &&
      this.options.backend.helperAvailable()
    );
  }
  #project() {
    this.#roster = appRoster(this.#slots, this.#snapshot, this.selected());
    this.#slots = this.#roster.slots;
    this.#layoutStamp = digest(
      this.#roster.entries.map((p) => paneKey(p?.target)),
    );
    this.setBank(this.#bank);
  }
  #focusConsented() {
    return (
      this.#online() &&
      this.options.config().herdrApp?.focusRequestEnabled === true
    );
  }
  #pane(action: string) {
    if (action === 'next') return this.#roster.next;
    if (action === 'attention') return this.#roster.attention?.agent;
    if (/^agent:[0-4]$/.test(action))
      return this.#roster.entries[this.#bank * 5 + Number(action.slice(6))];
    return undefined;
  }
  mapping(key: AppKey) {
    if (
      !this.#snapshot ||
      this.#settingsError ||
      (key.notice &&
        key.notice.until > this.options.clock() &&
        key.notice.generation === this.#generation)
    )
      return 'none';
    const action = defaultAppAction(key);
    if (action === 'collapse')
      return this.#slots.length > this.#roster.occupied.length
        ? action
        : 'none';
    if (action === 'banknext') return this.#banks() > 1 ? action : 'none';
    // The App cannot bind its pane to a Core connection (ADR 0007). Saved provider overrides stay inert.
    return this.#pane(action) ? action : 'none';
  }
  #presentation(key: AppKey, focus: boolean): AppPresentation {
    const action = this.mapping(key),
      pane = this.#pane(action);
    const conditions: AppTargetConditions | null = pane
      ? {
          action: action === 'next' || action === 'attention' ? action : 'tile',
          provider: appProvider(pane.reportedApp),
          name: destinationName(pane),
          reason: action === 'attention' ? this.#roster.attention.kind : null,
          appSelection: action.startsWith('agent:')
            ? ''
            : paneKey(this.#snapshot?.selected),
          effectiveSelection: action.startsWith('agent:')
            ? ''
            : paneKey(this.selected()),
        }
      : null;
    const endpointGeneration = this.#snapshot?.endpointGeneration ?? 0;
    const signature = JSON.stringify([
      this.#generation,
      endpointGeneration,
      this.#port?.peerKey,
      this.#port?.recordKey,
      this.#backendKey,
      this.#bank,
      key.settings.action,
      action,
      conditions,
      paneKey(pane?.target),
      focus,
      action === 'collapse' || action === 'banknext' ? this.#layoutStamp : null,
    ]);
    if (key.signature !== signature) {
      key.signature = signature;
      key.revision = (key.revision ?? 0) + 1;
    }
    const stamp = String(key.revision);
    return {
      action,
      appearance: key.appearance,
      visibility: this.#visibility,
      generation: this.#generation,
      backendKey: this.#backendKey,
      stamp,
      armedAt:
        key.presented?.stamp === stamp
          ? key.presented.armedAt
          : this.options.clock() + 350,
      conditions,
      slotOrder:
        action === 'next' || action === 'attention' ? this.#slots : undefined,
      focus,
      target: pane?.target ?? null,
      endpointGeneration,
      peerKey: this.#port?.peerKey ?? '',
      recordKey: this.#port?.recordKey ?? '',
    };
  }
  #state(): AppFocusState {
    const key = this.#active && this.keys.get(this.#active);
    const shown = key ? key.presented : undefined;
    if (!shown?.conditions) throw Error('Focus refused');
    return {
      ...shown,
      conditions: shown.conditions,
      scope: 'herdr-app',
      control: 'requestFocus',
      page: 0,
      visible: true,
      setupBusy: this.#settingsError,
      focusRequestEnabled: this.#focusConsented(),
    };
  }
  render() {
    // Retire the source before a render can turn a verified tile into a local one.
    if (this.#snapshot && this.#port && !this.#online()) {
      this.#stop();
      return;
    }
    const focus =
      !!this.#snapshot &&
      !!this.#port &&
      this.options.config().herdrApp?.focusRequestEnabled === true;
    for (const [context, key] of this.keys) {
      if (
        key.notice &&
        (key.notice.generation !== this.#generation ||
          key.notice.until <= this.options.clock())
      )
        delete key.notice;
      const shown = (key.presented = this.#presentation(key, focus));
      const action = defaultAppAction(key);
      const spec = appTile({
        key,
        pane: this.#pane(action),
        slot: action.startsWith('agent:')
          ? this.#slots[this.#bank * 5 + Number(action.slice(6))]
          : undefined,
        selected: this.#snapshot?.selected ?? null,
        deckSelected: this.#selection,
        online: !!this.#snapshot,
        consent: shown.focus,
        mapped: shown.action,
        reason: shown.conditions?.reason ?? undefined,
        bank: this.#bank,
        banks: this.#banks(),
        now: this.options.clock(),
        palette: this.#config.palette as Record<string, string>,
        style: this.#config.appearance?.style,
      });
      const specKey = this.options.frames.key(spec);
      if (key.specKey === specKey) continue;
      key.specKey = specKey;
      key.lastImage = this.options.frames.image(spec);
      this.options.emit('setImage', context, {
        image: key.lastImage,
        target: 0,
      });
      this.options.emit('setTitle', context, { title: '', target: 0 });
    }
  }
  // Reads from a retired source may finish after a replacement opens. Only
  // the current poll owns its completion callback and published roster.
  #stop(retirePoll = true) {
    if (retirePoll) this.#refreshing = null;
    this.#port?.dispose();
    this.#port = null;
    this.#observer?.dispose();
    this.#observer = null;
    this.#snapshot = null;
    this.#message = '';
    this.#coreReader?.close();
    this.#coreReader = null;
    this.#coreReading = null;
    this.#coreCount = undefined;
    this.#selection = null;
    this.#generation = this.options.nextGeneration();
    this.#slots = [];
    this.#bank = 0;
    this.#project();
    this.render();
  }
  applySettings() {
    try {
      const config = this.options.config(),
        key = digest(config.herdrApp);
      this.#settingsError = false;
      if (key !== this.#backendKey) {
        this.#stop();
        this.#backendKey = key;
      }
      this.#config = config;
    } catch {
      this.#settingsError = true;
      this.#stop();
    }
    this.render();
    if (this.keys.size) this.options.enqueue(() => this.refresh());
  }
  async initialize() {
    await this.refresh();
  }
  refresh(retryVerification = false): Promise<void> {
    if (this.#refreshing) return this.#refreshing;
    if (
      this.#active ||
      !this.keys.size ||
      this.#settingsError ||
      !this.#config.herdrApp?.home
    )
      return Promise.resolve();
    const pending = this.#read(retryVerification).finally(() => {
      if (this.#refreshing !== pending) return;
      this.#refreshing = null;
      this.render();
    });
    this.#refreshing = pending;
    return pending;
  }
  #accept(snapshot: AppSelectionSnapshot) {
    if (
      this.#snapshot &&
      this.#snapshot.endpointGeneration !== snapshot.endpointGeneration
    ) {
      this.#generation = this.options.nextGeneration();
      this.#slots = [];
      this.#bank = 0;
      this.#selection = null;
    }
    if (paneKey(this.#snapshot?.selected) !== paneKey(snapshot.selected))
      this.#selection = null;
    this.#snapshot = snapshot;
    this.#project();
    if (this.#selection && !this.#roster.live.has(paneKey(this.#selection))) {
      this.#selection = null;
      this.#project();
    }
  }
  async #read(retryVerification: boolean) {
    if (retryVerification && this.#observer && this.#focusCapable())
      this.#stop(false);
    if (this.#port && !this.#focusCapable()) this.#stop(false);
    let generation = this.#generation;
    try {
      if (!this.#observer && this.#focusCapable()) {
        try {
          const port = (this.#port ??= this.options.backend.create(
            this.#config,
            this.#authority,
          ));
          const snapshot = await port.observe();
          if (generation !== this.#generation || this.#port !== port) return;
          this.#accept(snapshot);
          this.render();
          if (this.#snapshot === snapshot)
            void this.#refreshCore(this.#generation);
          return;
        } catch (error) {
          if (generation !== this.#generation) return;
          this.#stop(false);
          generation = this.#generation;
          // Only a fresh independent read can establish a local-only presentation.
          if (
            !(error instanceof Error) ||
            !['App unavailable', 'Build mismatch', 'Peer unverified'].includes(
              error.message,
            )
          )
            return;
        }
      }
      const reader = (this.#observer ??=
        this.options.reader?.(this.#config) ?? null);
      if (!reader) return;
      const snapshot = await reader.observe();
      if (generation !== this.#generation || reader !== this.#observer) return;
      this.#accept(snapshot);
      this.render();
      void this.#refreshCore(this.#generation);
    } catch {
      if (generation === this.#generation) this.#stop(false);
    }
  }
  /** Local deck selection only: no App request, focus claim or authority. */
  #select(display: AppPresentation) {
    if (!display.target) throw Error('Request stale');
    this.#selection = structuredClone(display.target);
    this.#bank = Math.floor(
      (this.#roster.indices.get(paneKey(display.target)) ?? 0) / 5,
    );
    this.#project();
    this.#message = 'Deck selected; App focus unchanged';
  }
  /** Only publish the Core count while its separate readback consent is current. */
  #coreAllowed(config = this.#config) {
    return (
      config.herdrApp?.readbackEnabled === true &&
      !!config.herdrApp.coreSocketPath
    );
  }
  async #refreshCore(generation: number) {
    if (!this.#coreAllowed() || !this.options.core) {
      this.#coreReader?.close();
      this.#coreReader = null;
      this.#coreCount = undefined;
      return;
    }
    if (this.#coreReading) return;
    let reader: AppCoreStatusPort | null = null;
    try {
      reader = this.#coreReader ??= this.options.core(this.#config);
      if (!reader) return;
      this.#coreReading = reader;
      const core = await reader.read();
      if (
        generation === this.#generation &&
        reader === this.#coreReader &&
        this.#coreAllowed(this.options.config())
      )
        this.#coreCount = core.terminals.length;
    } catch {
      if (generation !== this.#generation || reader !== this.#coreReader)
        return;
      reader?.close();
      this.#coreReader = null;
      this.#coreCount = undefined;
    } finally {
      if (reader === this.#coreReading) this.#coreReading = null;
    }
  }
  #assertShown(context: string, display: AppPresentation) {
    const key = this.keys.get(context);
    if (this.#port && !this.#online()) throw Error('Request stale');
    if (
      !key ||
      display.setupBusy ||
      this.#settingsError ||
      (this.#port &&
        (this.#port.generation !== display.endpointGeneration ||
          this.#port.peerKey !== display.peerKey ||
          this.#port.recordKey !== display.recordKey)) ||
      display.appearance !== key.appearance ||
      display.visibility !== this.#visibility ||
      display.generation !== this.#generation ||
      display.backendKey !== this.#backendKey ||
      display.stamp !== key.presented?.stamp ||
      display.pressedAt === undefined ||
      display.pressedAt < display.armedAt ||
      display.pressedAt > this.options.clock() ||
      this.options.clock() - display.pressedAt > this.options.queueStaleMs ||
      display.focus !== this.#focusConsented() ||
      display.action !== this.mapping(key)
    )
      throw Error('Request stale');
  }
  async press(context: string, display?: AppPresentation) {
    const key = this.keys.get(context);
    if (!key || this.#active) return;
    display ??= key.presented;
    if (!display || display.action === 'none') return;
    if (display.appearance !== key.appearance) return;
    if (
      display.pressedAt !== undefined &&
      display.pressedAt < display.armedAt
    ) {
      this.options.emit('showAlert', context, {});
      return;
    }
    this.#active = context;
    try {
      this.#assertShown(context, display);
      if (display.pressedAt === undefined) throw Error('Request stale');
      const remaining =
        (display.focus && display.target ? 1000 : this.options.queueStaleMs) -
        (this.options.clock() - display.pressedAt);
      if (remaining <= 0) throw Error('Request expired');
      const signal = AbortSignal.timeout(Math.ceil(remaining));
      if (this.#refreshing) {
        await waitForPoll(this.#refreshing, signal);
        this.#assertShown(context, display);
      }
      if (display.action === 'banknext')
        this.#bank = (this.#bank + 1) % this.#banks();
      else if (display.action === 'collapse') {
        this.#slots = this.#roster.occupied.map((p) => p.target);
        this.#project();
      } else {
        if (!display.target || !display.conditions)
          throw Error('Request stale');
        if (display.focus) {
          if (!this.#port) throw Error('Focus refused');
          const permit = this.#authority.issue({
            ...this.#state(),
            ...display,
            conditions: display.conditions,
            target: display.target,
            pressedAt: display.pressedAt,
          });
          const { preflight } = await this.#port.deliver(
            { kind: 'requestFocus' },
            permit,
            signal,
          );
          try {
            this.#assertShown(context, display);
            if (preflight.endpointGeneration !== display.endpointGeneration)
              throw Error('Request stale');
          } catch {
            throw Error('Focus uncertain');
          }
          this.#accept(preflight);
          this.#select(display);
          key.notice = {
            until: this.options.clock() + 2500,
            message: 'Focus requested',
            error: false,
            generation: this.#generation,
          };
          this.#message = 'Focus requested; keyboard focus is not verified';
        } else {
          if (display.action === 'attention') {
            const source = this.#port ?? this.#observer;
            if (!source) throw Error('Request stale');
            const fresh = await source.observe(signal).catch((error) => {
              if (
                signal.aborted ||
                (error instanceof Error && error.message === 'App read expired')
              )
                throw Error('App read expired');
              throw Error('App view unavailable');
            });
            this.#assertShown(context, display);
            if (source !== (this.#port ?? this.#observer) || signal.aborted)
              throw Error('Request stale');
            this.#accept(fresh);
            this.render();
            this.#assertShown(context, display);
            if (
              !matchesAppTarget(
                fresh,
                display.target,
                display.conditions,
                display.slotOrder,
              )
            )
              throw Error('Request stale');
          }
          this.#select(display);
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Focus refused';
      const sameSource = display.generation === this.#generation;
      if (
        sameSource &&
        (reason === 'App view unavailable' ||
          reason === 'App read expired' ||
          (this.#port && this.#port.generation !== display.endpointGeneration))
      )
        this.#stop();
      const message =
        reason === 'Focus uncertain'
          ? reason
          : [
                'Request stale',
                'Request expired',
                'App read expired',
                'Target changed',
              ].includes(reason)
            ? 'Press again'
            : 'Focus refused';
      if (
        this.keys.get(context) === key &&
        (sameSource || reason === 'Focus uncertain')
      ) {
        key.notice = {
          until: this.options.clock() + 2500,
          message,
          error: true,
          generation: this.#generation,
        };
        this.options.emit('showAlert', context, {});
      }
      if (sameSource) this.#message = message;
    } finally {
      this.#active = null;
      this.render();
    }
  }
  attach(
    context: string,
    payload: {
      settings?: Record<string, unknown>;
      coordinates: AppKey['coordinates'];
    },
  ) {
    if (!this.keys.size) this.#visibility++;
    this.keys.set(context, {
      settings: payload.settings ?? {},
      coordinates: payload.coordinates,
      appearance: ++this.#appearance,
    });
    this.render();
    if (this.keys.size === 1) this.options.enqueue(() => this.initialize());
  }
  detach(context: string) {
    this.keys.delete(context);
    if (!this.keys.size) {
      this.#visibility++;
      this.#stop();
    }
  }
  async inspectorRequest(event: {
    context: string;
    payload?: { kind?: string; preferences?: unknown };
  }) {
    if (!this.keys.has(event.context)) return;
    if (event.payload?.kind === 'refresh') {
      const appearance = this.keys.get(event.context)?.appearance;
      if (this.#refreshing || this.#active)
        this.#message = 'App status check already running';
      else {
        await this.refresh(true);
        this.#message = this.#snapshot
          ? 'App status refreshed'
          : 'No matched App connection; check the instance and App home';
      }
      // A reply to an old inspector must not describe a reappeared key.
      if (this.keys.get(event.context)?.appearance !== appearance) return;
    }
    appInspectorRequest(event, {
      emit: this.options.emit,
      save: this.options.save,
      state: () => ({
        preferences: this.options.view(this.#config),
        panes: this.#roster.occupied.length,
        codex: this.#roster.occupied.filter(
          (p) => appProvider(p.reportedApp) === 'codex',
        ).length,
        coreCount: this.#coreCount,
        verifiedPeer: this.#online(),
        setupBusy: this.#settingsError,
        message: this.#message,
        helperAvailable: this.options.backend.helperAvailable(),
        recordCount: this.options.backend.recordCount,
        homeConfigured: !!this.#config.herdrApp?.home,
        focusRequestEnabled:
          this.#config.herdrApp?.focusRequestEnabled === true,
        connected: !!this.#snapshot,
      }),
    });
  }
}
