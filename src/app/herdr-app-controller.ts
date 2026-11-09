import { createHash } from 'node:crypto';
import type { Config } from '../domain/types';
import type { AppFocusPort, AppFocusState } from '../domain/app-focus-request';
import type { AppPaneRef, AppSelectionSnapshot } from '../domain/app-selection';
import { AppFocusAuthority } from '../guards/app-focus-request';
import type { AppFocusBackendFactory } from './herdr-app-backend';
import { appInspectorRequest } from './herdr-app-inspector';
import {
  appAction,
  appTile,
  paneKey,
  type AppKey,
  type AppPresentation,
} from './herdr-app-view';

interface Options {
  config(): Config;
  view(config: Config): Record<string, unknown>;
  save(patch: unknown): void;
  emit(event: string, context: string, payload: Record<string, unknown>): void;
  svg(input: Record<string, unknown>): string;
  clock(): number;
  nextGeneration(): number;
  enqueue(work: () => Promise<void>): void;
  settled(): Promise<void>;
  backend: AppFocusBackendFactory;
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
  #snapshot: AppSelectionSnapshot | null = null;
  #slots: AppPaneRef[] = [];
  #selection: AppPaneRef | null = null;
  #bank = 0;
  #armedAt = 0;
  #lastStamp = '';
  #refreshing = false;
  #active: { context: string; display: AppPresentation } | null = null;
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
  #online() {
    return (
      !!this.#snapshot &&
      !!this.#port?.peerKey &&
      this.options.backend.recordCount > 0 &&
      this.options.backend.helperAvailable()
    );
  }
  #stamp() {
    return digest([
      this.#generation,
      this.#bank,
      this.#port?.generation,
      this.#port?.peerKey,
      this.#port?.recordKey,
      this.#snapshot,
      this.#selection,
      this.#slots,
    ]);
  }
  mapping(key: AppKey) {
    const action = appAction(
      key,
      this.#online() && this.#config.herdrApp?.focusRequestEnabled === true,
      this.options.backend.recordCount > 0,
    );
    return (action === 'next' || action.startsWith('agent:')) &&
      !this.#target(action)
      ? 'none'
      : action;
  }
  #target(action: string): AppPaneRef | null {
    const panes = this.#snapshot?.panes ?? [];
    if (action === 'next') {
      const index = panes.findIndex(
        (pane) => paneKey(pane.target) === paneKey(this.selected()),
      );
      return panes.length ? panes[(index + 1) % panes.length].target : null;
    }
    if (!/^agent:[0-4]$/.test(action)) return null;
    const slot = this.#slots[this.#bank * 5 + Number(action.slice(6))];
    return (
      panes.find((pane) => paneKey(pane.target) === paneKey(slot ?? null))
        ?.target ?? null
    );
  }
  #presentation(key: AppKey): AppPresentation {
    const action = this.mapping(key);
    return {
      action,
      appearance: key.appearance,
      visibility: this.#visibility,
      generation: this.#generation,
      backendKey: this.#backendKey,
      stamp: this.#stamp(),
      armedAt: this.#armedAt,
      target: structuredClone(this.#target(action)),
      endpointGeneration: this.#port?.generation ?? 0,
      peerKey: this.#port?.peerKey ?? '',
      recordKey: this.#port?.recordKey ?? '',
    };
  }
  #state(): AppFocusState {
    const key = this.#active && this.keys.get(this.#active.context);
    return {
      scope: 'herdr-app',
      control: 'requestFocus',
      appearance: key?.appearance ?? 0,
      visibility: this.#visibility,
      generation: this.#generation,
      backendKey: this.#backendKey,
      page: 0,
      stamp: this.#stamp(),
      armedAt: this.#armedAt,
      endpointGeneration: this.#port?.generation ?? 0,
      peerKey: this.#port?.peerKey ?? '',
      recordKey: this.#port?.recordKey ?? '',
      target: key ? this.#target(this.mapping(key)) : null,
      visible: !!key,
      setupBusy: this.#settingsError,
      focusRequestEnabled:
        this.#config.herdrApp?.focusRequestEnabled === true && this.#online(),
    };
  }
  render() {
    const stamp = this.#stamp();
    if (stamp !== this.#lastStamp) {
      this.#lastStamp = stamp;
      this.#armedAt = this.options.clock() + 350;
    }
    for (const [context, key] of this.keys) {
      const action = key.settings.action || `agent:${key.coordinates.column}`;
      const slot =
        this.#slots[this.#bank * 5 + Number(String(action).slice(6))];
      const pane = this.#snapshot?.panes.find(
        (pane) => paneKey(pane.target) === paneKey(slot ?? null),
      );
      key.presented = this.#presentation(key);
      const image =
        'data:image/svg+xml;base64,' +
        Buffer.from(
          this.options.svg(
            appTile({
              key,
              pane,
              slot,
              selected: this.selected(),
              deckSelected: this.#selection,
              preview: this.options.backend.recordCount === 0,
              online: this.#online(),
              consent: this.#config.herdrApp?.focusRequestEnabled === true,
              bank: this.#bank,
              banks: this.#banks(),
              now: this.options.clock(),
              palette: this.#config.palette as Record<string, string>,
            }),
          ),
        ).toString('base64');
      if (image === key.lastImage) continue;
      key.lastImage = image;
      this.options.emit('setImage', context, { image, target: 0 });
      this.options.emit('setTitle', context, { title: '', target: 0 });
    }
  }
  #stop(clearSlots = false) {
    this.#port?.dispose();
    this.#port = null;
    this.#snapshot = null;
    this.#selection = null;
    this.#generation = this.options.nextGeneration();
    if (clearSlots) {
      this.#slots = [];
      this.#bank = 0;
    }
  }
  applySettings() {
    try {
      const config = this.options.config(),
        key = digest(config.herdrApp);
      this.#settingsError = false;
      if (key !== this.#backendKey) {
        this.#stop(true);
        this.#backendKey = key;
      }
      this.#config = config;
    } catch {
      this.#settingsError = true;
      this.#stop(true);
    }
    this.render();
    if (this.keys.size) this.options.enqueue(() => this.refresh());
  }
  async initialize() {
    await this.refresh();
  }
  async refresh() {
    if (
      this.#refreshing ||
      this.#active ||
      !this.keys.size ||
      this.#settingsError
    )
      return;
    if (
      !this.options.backend.recordCount ||
      !this.#config.herdrApp?.home ||
      !this.options.backend.helperAvailable()
    ) {
      this.render();
      return;
    }
    this.#refreshing = true;
    const generation = this.#generation;
    try {
      this.#port ??= this.options.backend.create(this.#config, this.#authority);
      const port = this.#port,
        snapshot = await port.observe();
      if (
        generation !== this.#generation ||
        port !== this.#port ||
        !this.keys.size
      )
        return;
      if (
        paneKey(this.#snapshot?.selected ?? null) !== paneKey(snapshot.selected)
      )
        this.#selection = null;
      this.#snapshot = structuredClone(snapshot);
      for (const { target } of snapshot.panes)
        if (!this.#slots.some((slot) => paneKey(slot) === paneKey(target)))
          this.#slots.push(structuredClone(target));
      if (
        this.#selection &&
        !snapshot.panes.some(
          (pane) => paneKey(pane.target) === paneKey(this.#selection),
        )
      )
        this.#selection = null;
      this.setBank(this.#bank);
    } catch {
      if (generation === this.#generation) this.#stop();
    } finally {
      this.#refreshing = false;
      this.render();
    }
  }
  #assertShown(context: string, display: AppPresentation) {
    const key = this.keys.get(context);
    if (
      !key ||
      display.setupBusy ||
      this.#settingsError ||
      display.appearance !== key.appearance ||
      display.visibility !== this.#visibility ||
      display.generation !== this.#generation ||
      display.backendKey !== this.#backendKey ||
      display.stamp !== this.#stamp() ||
      display.action !== this.mapping(key)
    )
      throw Error('Request stale');
  }
  async press(context: string, display?: AppPresentation) {
    const key = this.keys.get(context);
    if (!key || this.#active) return;
    display ??= key.presented;
    if (!display || display.action === 'none') return;
    this.#active = { context, display };
    try {
      this.#assertShown(context, display);
      if (display.action === 'banknext')
        this.#bank = (this.#bank + 1) % this.#banks();
      else if (display.action === 'collapse') {
        this.#slots = this.#slots.filter((slot) =>
          this.#snapshot?.panes.some(
            (pane) => paneKey(pane.target) === paneKey(slot),
          ),
        );
        this.setBank(this.#bank);
      } else {
        if (!display.target || !this.#port || display.pressedAt === undefined)
          throw Error('Focus refused');
        const state = this.#state();
        const permit = this.#authority.issue({
          ...state,
          ...display,
          target: display.target,
          pressedAt: display.pressedAt,
          scope: 'herdr-app',
          control: 'requestFocus',
          page: 0,
        });
        await this.#port.deliver({ kind: 'requestFocus' }, permit);
        this.#assertShown(context, display);
        this.#selection = structuredClone(display.target);
        this.#bank = Math.floor(
          this.#slots.findIndex(
            (slot) => paneKey(slot) === paneKey(display.target),
          ) / 5,
        );
        key.notice = {
          until: this.options.clock() + 2500,
          message: 'Focus requested',
          error: false,
          stamp: this.#stamp(),
        };
        this.#message = 'Focus requested; keyboard focus is not verified';
      }
    } catch (error) {
      const message =
        error instanceof Error &&
        ['Focus uncertain', 'Request stale', 'Request expired'].includes(
          error.message,
        )
          ? error.message
          : 'Focus refused';
      if (this.keys.get(context) === key) {
        key.notice = {
          until: this.options.clock() + 2500,
          message,
          error: true,
          stamp: this.#stamp(),
        };
        this.options.emit('showAlert', context, {});
      }
      this.#message = message;
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
      this.#stop(true);
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
        await this.refresh();
        this.#message = this.#online()
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
        panes: this.#snapshot?.panes.length ?? 0,
        setupBusy: this.#settingsError,
        message: this.#message,
        helperAvailable: this.options.backend.helperAvailable(),
        recordCount: this.options.backend.recordCount,
        homeConfigured: !!this.#config.herdrApp?.home,
        focusRequestEnabled:
          this.#config.herdrApp?.focusRequestEnabled === true,
        connected: this.#online(),
      }),
    });
  }
}
