import { createHash } from 'node:crypto';
import type { Config } from '../domain/types';
import type { AppFocusState } from '../domain/app-focus-request';
import { AppTargetChanged } from '../domain/app-focus-request';
import type { AppPaneRef, AppSelectionSnapshot } from '../domain/app-selection';
import { AppRoster, type AppRosterView } from '../domain/app-roster';
import type { AppCoreStatusPort } from '../terminals/herdr-app/core-status';
import { AppFocusAuthority } from '../guards/app-focus-request';
import type { AppFocusBackendFactory } from './herdr-app-backend';
import {
  HerdrAppSource,
  type AppSelectionObserver,
  type AppSourceChange,
} from './herdr-app-source';
export type { AppSelectionObserver } from './herdr-app-source';
import { appInspectorRequest } from './herdr-app-inspector';
import type { FrameCache } from '../render/frame';
import {
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
  readonly #source: HerdrAppSource;
  #coreReader: AppCoreStatusPort | null = null;
  readonly #roster = new AppRoster();
  #coreCount: number | undefined;
  #coreReading: AppCoreStatusPort | null = null;
  #slotEpoch = 0;
  #active: string | null = null;
  #settingsError = false;
  #message = '';
  constructor(private readonly options: Options) {
    this.#config = options.config();
    this.#generation = options.nextGeneration();
    this.#backendKey = digest(this.#config.herdrApp);
    this.#authority = new AppFocusAuthority(() => this.#state(), options.clock);
    this.#source = new HerdrAppSource({
      config: () => this.#config,
      backend: options.backend,
      authority: this.#authority,
      reader: options.reader,
      changed: (change) => this.#sourceChanged(change),
    });
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
    return this.#roster.view.bank;
  }
  setBank(value: number) {
    this.#roster.setBank(value);
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
    return this.#roster.view.selected;
  }
  #online() {
    return this.#source.verified;
  }
  #focusConsented() {
    return (
      this.#online() &&
      this.options.config().herdrApp?.focusRequestEnabled === true
    );
  }
  mapping(key: AppKey, view: AppRosterView = this.#roster.view) {
    if (
      !view.available ||
      this.#settingsError ||
      (key.notice &&
        key.notice.until > this.options.clock() &&
        key.notice.generation === this.#generation)
    )
      return 'none';
    const action = defaultAppAction(key);
    if (action === 'collapse') return view.canCollapse ? action : 'none';
    if (action === 'banknext') return view.banks > 1 ? action : 'none';
    // The App cannot bind its pane to a Core connection (ADR 0007). Saved provider overrides stay inert.
    return view.destinations[action] ? action : 'none';
  }
  #presentation(
    key: AppKey,
    focus: boolean,
    view: AppRosterView,
  ): AppPresentation {
    const action = this.mapping(key, view),
      pane = view.destinations[action];
    const conditions: AppTargetConditions | null = pane
      ? {
          action: action === 'next' || action === 'attention' ? action : 'tile',
          provider: appProvider(pane.reportedApp),
          name: destinationName(pane),
          reason: action === 'attention' ? view.attention!.kind : null,
          appSelection: action.startsWith('agent:')
            ? ''
            : paneKey(view.appSelected),
          effectiveSelection: action.startsWith('agent:')
            ? ''
            : paneKey(view.selected),
        }
      : null;
    const source = this.#source.stamp;
    const endpointGeneration = this.#source.snapshot?.endpointGeneration ?? 0;
    const signature = JSON.stringify([
      this.#generation,
      endpointGeneration,
      source.sourceId,
      source.peerKey,
      source.recordKey,
      this.#backendKey,
      view.bank,
      key.settings.action,
      action,
      conditions,
      paneKey(pane?.target),
      focus,
      action === 'collapse' || action === 'banknext' ? view.layoutKey : null,
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
        action === 'next' || action === 'attention' ? view.slots : undefined,
      focus,
      target: pane?.target ?? null,
      endpointGeneration,
      sourceId: source.sourceId,
      peerKey: source.peerKey,
      recordKey: source.recordKey,
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
    if (!this.#source.check()) return;
    const view = this.#roster.view;
    const focus =
      this.#source.verified &&
      this.options.config().herdrApp?.focusRequestEnabled === true;
    for (const [context, key] of this.keys) {
      if (
        key.notice &&
        (key.notice.generation !== this.#generation ||
          key.notice.until <= this.options.clock())
      )
        delete key.notice;
      const shown = (key.presented = this.#presentation(key, focus, view));
      const action = defaultAppAction(key);
      const spec = appTile({
        key,
        pane: view.destinations[action],
        slot:
          view.available && /^agent:[0-4]$/.test(action)
            ? view.tiles[Number(action.slice(6))].slot
            : undefined,
        selected: view.appSelected,
        deckSelected: view.deckSelected,
        online: view.available,
        viewChanging: !this.#source.snapshot && this.#slotEpoch > 0,
        consent: shown.focus,
        mapped: shown.action,
        reason: shown.conditions?.reason ?? undefined,
        bank: view.bank,
        banks: view.banks,
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
  #sourceChanged(change: AppSourceChange) {
    if (change.kind === 'observed') {
      this.#accept(change.snapshot);
      this.render();
      if (this.#source.snapshot === change.snapshot)
        void this.#refreshCore(this.#generation);
      return;
    }
    this.#generation = this.options.nextGeneration();
    if (change.kind === 'suspended') this.#roster.suspend();
    else {
      this.#message = '';
      this.#coreReader?.close();
      this.#coreReader = null;
      this.#coreReading = null;
      this.#coreCount = undefined;
      this.#slotEpoch = 0;
      this.#roster.reset();
    }
    this.render();
  }
  applySettings() {
    try {
      const config = this.options.config(),
        key = digest(config.herdrApp);
      this.#settingsError = false;
      if (key !== this.#backendKey) {
        this.#source.retire();
        this.#backendKey = key;
      }
      this.#config = config;
    } catch {
      this.#settingsError = true;
      this.#source.retire();
    }
    this.render();
    if (this.keys.size) this.options.enqueue(() => this.refresh());
  }
  async initialize() {
    await this.refresh();
  }
  refresh(retryVerification = false): Promise<void> {
    if (this.#source.pending) return this.#source.pending;
    if (
      this.#active ||
      !this.keys.size ||
      this.#settingsError ||
      !this.#config.herdrApp?.home
    )
      return Promise.resolve();
    return this.#source.poll(retryVerification);
  }
  #accept(snapshot: AppSelectionSnapshot, confirmed?: AppPaneRef) {
    if (this.#slotEpoch && this.#slotEpoch !== snapshot.endpointGeneration) {
      this.#generation = this.options.nextGeneration();
      this.#roster.reset();
    }
    if (confirmed) this.#roster.acknowledgeFocus(snapshot, confirmed);
    else this.#roster.observe(snapshot);
    this.#source.accept(this.#source.stamp.sourceId, snapshot);
    this.#slotEpoch = snapshot.endpointGeneration;
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
    if (
      !key ||
      display.setupBusy ||
      this.#settingsError ||
      !this.#source.matches(display) ||
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
    const pagingOrCycling =
      display.action === 'next' || display.action === 'banknext';
    if (
      display.pressedAt !== undefined &&
      display.pressedAt < display.armedAt
    ) {
      if (!pagingOrCycling) this.options.emit('showAlert', context, {});
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
      await this.#source.waitForPoll(display.sourceId, signal);
      this.#assertShown(context, display);
      if (display.action === 'banknext') this.#roster.page();
      else if (display.action === 'collapse') this.#roster.collapse();
      else {
        if (!display.target || !display.conditions)
          throw Error('Request stale');
        if (display.focus) {
          const port = this.#source.portForPress(display.sourceId);
          const permit = this.#authority.issue({
            ...this.#state(),
            ...display,
            conditions: display.conditions,
            target: display.target,
            pressedAt: display.pressedAt,
          });
          const { preflight } = await port.deliver(
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
          this.#accept(preflight, display.target);
          this.#message = 'Focus requested; keyboard focus is not verified';
        } else {
          const fresh = await this.#source.readForPress(
            display.sourceId,
            signal,
          );
          this.#assertShown(context, display);
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
          this.#roster.select(display.target);
          this.#message = 'Deck selected; App focus unchanged';
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Focus refused';
      const sameSource = display.generation === this.#generation;
      if (
        sameSource &&
        error instanceof AppTargetChanged &&
        this.#online() &&
        error.snapshot.endpointGeneration === display.endpointGeneration
      )
        this.#accept(error.snapshot);
      if (
        sameSource &&
        (reason === 'App read expired' ||
          (this.#source.hasPort &&
            this.#source.stamp.endpointGeneration !==
              display.endpointGeneration))
      )
        this.#source.retire();
      else if (sameSource && reason === 'App view unavailable')
        this.#source.suspend();
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
          until:
            this.options.clock() +
            (display.action === 'next' && message === 'Press again'
              ? 350
              : 2500),
          message,
          generation: this.#generation,
        };
        if (!pagingOrCycling || message !== 'Press again')
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
      this.#source.retire();
    }
  }
  async inspectorRequest(event: {
    context: string;
    payload?: { kind?: string; preferences?: unknown };
  }) {
    if (!this.keys.has(event.context)) return;
    if (event.payload?.kind === 'refresh') {
      const appearance = this.keys.get(event.context)?.appearance;
      if (this.#source.pending || this.#active)
        this.#message = 'App status check already running';
      else {
        await this.refresh(true);
        this.#message = this.#source.snapshot
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
        panes: this.#roster.view.agents.length,
        codex: this.#roster.view.agents.filter(
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
        connected: !!this.#source.snapshot,
      }),
    });
  }
}
