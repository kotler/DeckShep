const boundary = require('../schemas');
type GuardPipeline = import('../guards/pipeline').GuardPipeline;
type CompletionDisplay = import('../render/completion').CompletionDisplay;
type AgentSnapshot = import('../domain/types').AgentSnapshot;
type Config = import('../domain/types').Config;
type PressContext = import('../domain/types').PressContext;
('use strict');
const { pluginDirectory } = require('../platform/paths.ts');
const defaultFs = require('fs'),
  path = require('path'),
  unused: null = null;
const { Bridge } = require('./session'),
  { svg: defaultSvg, pulse: defaultPulse } = require('../render/visuals');
const {
    agentLines,
    modelLines,
    modeLines,
    effortLines,
    reviewerLines,
    footerMissing,
    sameTarget,
    keyMessage,
  } = require('../domain/labels'),
  { AgentMetadata } = require('../agents/codex/metadata');
const C = require('../guards/context');
const { GuardPipeline } = require('../guards/pipeline.ts');
const { DeliveryKernel } = require('./delivery.ts');
const {
  controlIdForAction,
  verifiedAction,
} = require('../domain/capabilities');
const { assertVerifiedControl } = require('../guards/verified-control');
const { controlAccent } = require('../render/signal');
const { CompletionDisplay } = require('../render/completion');
const { preferenceCodec } = require('./experimental-preferences');
const { HerdrAppPreview } = require('./herdr-app-preview');
const { HerdrAppController } = require('./herdr-app-controller');
const { AppCoreStatusReader } = require('../terminals/herdr-app/core-status');
const { HerdrAppClient } = require('../terminals/herdr-app/transport');
const { AppSelectionReader } = require('../terminals/herdr-app/selection');
const {
  attentionCandidates,
  navigationSnapshot,
  sameNavigationTarget,
} = require('../domain/navigation');
const {
  observeSettings,
  performRexKeyboard,
  rexSettingsAction,
} = require('./rex-keyboard-settings');
const { cycleClaudeMode } = require('../agents/claude/keyboard-mode');
const {
  refreshRexClaudeMetadata,
  rexDisplayAgent,
} = require('./rex-provider-metadata');
const { appFocusBackend } = require('./herdr-app-backend');
const { GuardedBackend } = require('../terminals/contract/backend');
const {
  IntegrationSetup,
  diagnostics,
  sessionChoices,
  sessionChecks,
} = require('./setup');
const { Controller } = require('./profile-controller');
const { CodexProvider } = require('../agents/codex/provider.ts');
const { ClaudeProvider } = require('../agents/claude/provider.ts');
import { keyFace } from './key-face';
import { holdActionOf } from '../domain/layout';
import { controlBlocker } from '../domain/blockers';
import { createPressGestures } from './press-gesture';
import type { HostFrame } from './host-frame';
import type { FaceAgent, FaceMode } from './key-face';
import { createFrameCache } from '../render/frame';
import type { KeySpec } from '../render/spec';
/** Shown on every key while the Herdr App backend cannot discover agents. */
const HERDR_APP_UNAVAILABLE: KeySpec = {
  icon: 'blank',
  lines: ['Herdr App', 'Unavailable'],
  color: '#38414b',
  pulse: 0,
  badge: '',
  accent: '#389ed7',
  style: 'signal',
  textOnly: false,
  agent: false,
};
/** A press that waited longer than this behind earlier work is refused. */
const QUEUE_STALE_MS = 2000;
const LOADING_DELAY_MS = 200;
const informationalActions = new Set([
  'none',
  'status',
  'inputInfo',
  'claudeInfo',
  'claudeModeInfo',
]);
const PROFILE_SETUP_ERROR: KeySpec = {
  ...HERDR_APP_UNAVAILABLE,
  lines: ['Profile', 'setup error'],
  color: '#893748',
};
function createApplication(dependencies: Record<string, any>) {
  const preferences = preferenceCodec(
    dependencies.experimentalHerdrApp === true,
  );
  const ws: any = dependencies.socket;
  const arg: (key: string) => any = (key: string) => dependencies.args?.[key];
  const fs: any = dependencies.fs || defaultFs;
  const clock: any = dependencies.clock || (() => Date.now());
  const focusClock = dependencies.clock || (() => performance.now());
  const { svg, pulse } = dependencies.renderer || {
    svg: defaultSvg,
    pulse: defaultPulse,
  };
  const frames = createFrameCache(svg);
  const gestures = createPressGestures({
    setTimeout: (fn: () => void, ms: number) => {
      const handle: any = (dependencies.setTimeout || setTimeout)(fn, ms);
      handle?.unref?.();
      return handle;
    },
    clearTimeout: (handle: unknown) =>
      (dependencies.clearTimeout || clearTimeout)(handle),
  });
  /** The clock that stamps `pressedAt`; the staleness check must use the same. */
  const pressClock = (scope: string): number =>
    scope === 'herdr-app' ? focusClock() : clock();
  const backendFactory: any =
    dependencies.backendFactory ||
    ((c: import('../domain/types').Config) =>
      c.backend === 'herdr'
        ? new (require('./herdr-session').HerdrBridge)(c)
        : new Bridge(c));
  const metadataFactory: any =
    dependencies.metadataFactory || ((b: any) => new AgentMetadata(b));
  const schedule: any = dependencies.setInterval || setInterval;
  const integrationSetup =
    dependencies.integrationSetup || new IntegrationSetup();
  const providers: any = dependencies.providers || [
    new CodexProvider(),
    new ClaudeProvider(),
  ];
  const emit: (event: any, context: any, payload: any) => void = (
    event: any,
    context: any,
    payload: any,
  ) => {
    if (ws.readyState !== 1) return;
    const frame = { event, context, payload } as HostFrame;
    // A typed port skips the JSON round trip; string sockets keep working.
    if (typeof ws.deliver === 'function') ws.deliver(frame);
    else ws.send(JSON.stringify(frame));
  };
  let saved:
      | {
          version: number;
          revision: number;
          shared: {};
          profiles: {
            rex: {};
            herdr: {};
          };
        }
      | {
          version: number;
          revision: any;
          shared: {};
          profiles: {
            [k: string]: {};
          };
        } = preferences.store(),
    storeError: string = '',
    loadedV2: boolean = false,
    queue: Promise<void> = Promise.resolve(),
    sequence: number = 0,
    appearanceSequence: number = 0;
  const controllers: Map<any, any> = new Map(),
    owners: Map<any, any> = new Map();
  async function settled() {
    let pending: any;
    do {
      pending = queue;
      await pending;
    } while (pending !== queue);
  }
  function persist() {
    loadedV2 = true;
    emit('setGlobalSettings', arg('-pluginUUID'), preferences.serialize(saved));
  }
  function getController(scope: any) {
    if (
      !['rex', 'herdr'].includes(scope) &&
      !(scope === 'herdr-app' && dependencies.experimentalHerdrApp === true)
    )
      throw Error('Unknown controller profile');
    if (!controllers.has(scope))
      controllers.set(
        scope,
        new Controller(
          scope,
          scope === 'herdr-app'
            ? new HerdrAppController({
                config: () =>
                  preferences.profileConfig(
                    boundary.parse(
                      'config',
                      fs.readFileSync(
                        path.join(pluginDirectory, 'config.json'),
                      ),
                    ),
                    saved,
                    'herdr-app',
                  ),
                view: (config: Config) => preferences.view(config),
                save: (patch: unknown) => {
                  saved = preferences.update(saved, 'herdr-app', patch);
                  persist();
                  applyAllSettings();
                },
                emit,
                svg,
                clock: focusClock,
                nextGeneration: () => ++sequence,
                enqueue: (work: () => Promise<void>) => {
                  queue = queue.then(work).catch(() => {});
                },
                settled,
                backend: dependencies.appFocusBackend || appFocusBackend,
                codex: dependencies.appCodexControls,
                reader:
                  dependencies.appSelectionReader ||
                  ((config: Config) => {
                    const client = new HerdrAppClient({
                      appHome: config.herdrApp?.home,
                    });
                    const reader = new AppSelectionReader(client);
                    return {
                      observe: () => reader.read(),
                      dispose: () => client.dispose(),
                    };
                  }),
                core:
                  dependencies.appCoreStatus ||
                  ((config: Config) =>
                    config.herdrApp?.coreSocketPath
                      ? AppCoreStatusReader.forSocket(
                          config.herdrApp.coreSocketPath,
                        )
                      : null),
              })
            : createRuntime(scope),
        ),
      );
    return controllers.get(scope);
  }
  function applyAllSettings() {
    for (const runtime of controllers.values()) runtime.applySettings();
  }
  function createRuntime(scope: any) {
    const configPath: string = path.join(pluginDirectory, 'config.json');
    let diskConfig: any = boundary.parse('config', fs.readFileSync(configPath)),
      config: any = preferences.profileConfig(diskConfig, saved, scope);
    let activePress: any = null,
      visibility: number = 0,
      actionBusy: boolean = false,
      settingsError: string = '',
      setupBusy: boolean = false,
      inspectorMessage: string = '';
    const backendKey: (c: any) => string = (c: any) =>
      c.backend +
      '|claude:' +
      String(c.claude?.enabled === true) +
      '|' +
      (c.backend === 'herdr-app'
        ? [
            c.herdrApp?.home || '',
            c.herdrApp?.coreSocketPath || '',
            c.herdrApp?.readbackEnabled === true,
            c.herdrApp?.inputEnabled === true,
          ].join('|')
        : c.backend === 'herdr'
          ? [c.herdr?.socketPath || '', c.herdr?.titleIdentity === true].join(
              '|',
            )
          : c.rexPath || '');
    const guards: GuardPipeline = new GuardPipeline(
      () => ({
        scope,
        visible: !!activePress && keys.has(activePress.ctx),
        appearance: activePress
          ? keys.get(activePress.ctx)?.appearance
          : undefined,
        visibility,
        generation: (bridge as any).generation,
        backendKey: (bridge as any).backendKey,
        page,
        stamp: C.stamp(selected(), page),
      }),
      () => clock(),
    );
    function makeBridge(c: any) {
      const b: any =
        c.backend === 'herdr-app' ? new HerdrAppPreview(c) : backendFactory(c);
      (b as any).backendKey = backendKey(c);
      (b as any).generation = ++sequence;
      b.attachDelivery(
        new DeliveryKernel(
          b as any,
          guards,
          () => activePress?.display || null,
          c.backend === 'herdr-app'
            ? (driver: any, authority: any) => {
                const backend = new GuardedBackend(
                  'herdr-app',
                  new Set(),
                  driver,
                  authority,
                  'unverified',
                );
                void backend.connect(new AbortController().signal);
                backend.generation = b.generation;
                return backend;
              }
            : undefined,
        ),
      );
      return b;
    }
    function makeMetadata(b: any) {
      return b.config.backend === 'herdr-app'
        ? {
            hydrate() {},
            async refresh(agents: any[]) {
              return agents;
            },
          }
        : metadataFactory(b);
    }
    let bridge: any = makeBridge(config),
      metadata: any = makeMetadata(bridge);
    const completion: CompletionDisplay = new CompletionDisplay(),
      keys: Map<any, any> = new Map(),
      transitions: Map<any, any> = new Map();
    let page: number = 0,
      bank: number = 0,
      busy: boolean = false,
      refreshDone: Promise<void> = Promise.resolve(),
      offline: boolean = true,
      metadataBusy: boolean = false,
      metadataAgain: boolean = false,
      startupSelectionRead: boolean = false,
      contextState: {
        stamp: string | null;
        armedAt: number;
      } = {
        stamp: null,
        armedAt: 0,
      } as {
        stamp: string | null;
        armedAt: number;
      };
    function loadConfig() {
      try {
        diskConfig = boundary.parse('config', fs.readFileSync(configPath));
        settingsError = '';
      } catch {
        settingsError = 'Settings file invalid; using the last valid defaults';
      }
      const next: any = preferences.profileConfig(diskConfig, saved, scope);
      if (backendKey(next) !== (bridge as any).backendKey) {
        if (actionBusy || setupBusy) return;
        bridge = makeBridge(next);
        metadata = makeMetadata(bridge);
        if (metadataBusy) metadataAgain = true;
        startupSelectionRead = false;
        bank = 0;
        page = 0;
        transitions.clear();
        contextState = {
          stamp: null,
          armedAt: 0,
        } as {
          stamp: string | null;
          armedAt: number;
        };
        for (const k of keys.values()) {
          k.notice = null;
          k.feedback = null;
        }
      }
      config = next;
      bridge.config = config;
    }
    const backendName: () => string = () =>
      scope === 'herdr-app' ? 'Herdr App' : scope === 'herdr' ? 'Herdr' : 'Rex';
    function selected() {
      const agent = bridge.agents?.find((a: any) =>
        sameTarget(bridge.lastTarget, a),
      );
      return scope === 'rex' && agent ? rexDisplayAgent(agent) : agent;
    }
    function navigationAgents() {
      return scope === 'rex'
        ? (bridge.navigationAgents || bridge.agents || []).map(
            (raw: AgentSnapshot) => {
              const live = bridge.agents?.find((agent: AgentSnapshot) =>
                sameNavigationTarget(raw, agent),
              );
              const observed = live && rexDisplayAgent(live);
              if (
                observed &&
                (observed !== live ||
                  (live.app === 'claude-code' &&
                    live.nativeVerified &&
                    (live.state === 'error' ||
                      (live.state === 'blocked' &&
                        ['auth', 'form'].includes(live.kind)))))
              ) {
                return navigationSnapshot({
                  ...raw,
                  state: observed.state,
                  kind: observed.kind,
                });
              }
              return navigationSnapshot(raw);
            },
          )
        : bridge.agents || [];
    }
    function navigationTarget() {
      return bridge.lastNavigationTarget === undefined
        ? bridge.lastTarget
        : bridge.lastNavigationTarget;
    }
    function rawMapping(k: any) {
      const override: any = k.settings.action;
      if (override) {
        if (
          [
            'planPrompt',
            'modelPicker',
            'effortPicker',
            'previous',
            'bankprev',
            'zoom',
            'tools',
            'more',
            'questions',
            'prompts',
            'back',
          ].includes(override)
        )
          return 'none';
        return override;
      }
      const { column: c, row: r } = k.coordinates;
      if (scope === 'rex' && !offline && r === 2 && !selected()) return 'none';
      return r === 0
        ? 'agent:' + c
        : C.layout(
            page,
            selected(),
            bridge.delivery?.backend.capabilities,
            bridge.delivery?.backend.id === 'herdr-app'
              ? bridge.delivery.backend.verifiedControls
              : undefined,
          )[(r - 1) * 5 + c];
    }
    /** The agent the controls act on, compared by pane (navigation copies lack proof fields). */
    function isControlTarget(a: AgentSnapshot): boolean {
      return sameNavigationTarget(bridge.lastTarget, a);
    }
    function isSelectedAgent(a: AgentSnapshot): boolean {
      return scope === 'rex'
        ? sameNavigationTarget(navigationTarget(), a)
        : sameTarget(bridge.lastTarget, a);
    }
    /** Ranked agents needing the user: the same list and states the agent keys show. */
    function attentionList(): {
      agent: AgentSnapshot;
      kind: import('../domain/navigation').AttentionKind;
      slot: number;
    }[] {
      const nav: AgentSnapshot[] = navigationAgents();
      return attentionCandidates(
        (bridge.slots as { session: string; block: string }[]).map((slot) => {
          const agent = nav.find(
            (a) => a.block === slot.block && a.session === slot.session,
          );
          return agent
            ? {
                agent,
                state: completion.agent(agent).state,
                selected: isSelectedAgent(agent) || isControlTarget(agent),
              }
            : undefined;
        }),
      );
    }
    function mapping(k: any) {
      const action = rawMapping(k),
        backend = bridge.delivery?.backend;
      // Group controls are useful only when topology offers work to do.
      if (action === 'next' && (bridge.agents?.length || 0) <= 1) return 'none';
      if (action === 'collapse' && (offline || !bridge.slotGaps()))
        return 'none';
      if (action === 'banknext' && bridge.slots.length <= 5) return 'none';
      if (
        action === 'attention' &&
        (scope === 'herdr-app' ||
          backend?.id === 'herdr-app' ||
          offline ||
          !attentionList().length)
      )
        return 'none';
      return backend?.id === 'herdr-app' &&
        !verifiedAction(action, backend.capabilities, backend.verifiedControls)
        ? 'none'
        : action;
    }
    function capture(k: any) {
      const target: any = selected(),
        action: any = mapping(k),
        contextStamp: string = C.stamp(target, page);
      return {
        setupBusy,
        scope,
        appearance: k.appearance,
        visibility,
        generation: (bridge as any).generation,
        action,
        ...(bridge.delivery?.backend.id === 'herdr-app'
          ? {
              controlId: controlIdForAction(action),
              verificationKey: bridge.delivery.backend.verificationKey,
            }
          : {}),
        page,
        backendKey: (bridge as any).backendKey,
        stamp: contextStamp,
        target: C.snapshot(
          action.startsWith('agent:') || action === 'attention'
            ? k.target
            : target,
        ),
        armedAt: contextState.armedAt,
        verifyChat: C.needsChat(action, target),
      };
    }
    function present(ctx: string, k: any, spec: KeySpec) {
      const id = frames.key(spec);
      if (id === k.lastSpecKey && k.lastImage === k.lastSpecImage) return;
      const first = !k.lastImage;
      const image = frames.image(spec);
      k.lastSpecKey = id;
      k.lastSpecImage = image;
      k.lastImage = image;
      emit('setImage', ctx, { image, target: 0 });
      if (first) emit('setTitle', ctx, { title: '', target: 0 });
    }
    function hydrateMetadata(agents: AgentSnapshot[]) {
      try {
        metadata.hydrate(agents);
      } catch {
        /* Provider captions cannot interrupt Rex navigation rendering. */
      }
    }
    function render() {
      if (scope === 'rex' && busy) return; // Publish discovery and display selection together.
      if (
        scope === 'herdr-app' &&
        !bridge.delivery.backend.capabilities.has('discover')
      ) {
        for (const [context, key] of keys) {
          key.presented = capture(key);
          present(context, key, HERDR_APP_UNAVAILABLE);
        }
        return;
      }
      hydrateMetadata(bridge.agents || []);
      const now: number = clock(),
        target: AgentSnapshot | undefined = selected(),
        mode: FaceMode = C.modeOf(target),
        contextStamp: string = C.stamp(target, page);
      const navigation = navigationAgents();
      completion.update(
        navigation,
        scope === 'rex'
          ? navigation.find((agent: any) =>
              sameNavigationTarget(navigationTarget(), agent),
            )
          : target,
        now,
      );
      if (contextState.stamp !== contextStamp)
        contextState = { stamp: contextStamp, armedAt: now + 350 };
      for (const [ctx, k] of keys) {
        const action: string = mapping(k);
        let agentView: FaceAgent | undefined;
        let attention: { kind: any; count: number } | undefined;
        if (action === 'attention') {
          const ranked = attentionList();
          k.target = ranked[0]?.agent;
          if (ranked[0])
            attention = { kind: ranked[0].kind, count: ranked.length };
        }
        if (action.startsWith('agent:')) {
          const slot: any =
              bridge.slots[bank * 5 + Number(action.split(':')[1])],
            a: AgentSnapshot | undefined = navigationAgents().find(
              (a: any) =>
                a.block === slot?.block && a.session === slot?.session,
            );
          k.target = a;
          agentView = { slotPresent: !!slot, selected: false, elapsedMs: 0 };
          if (a) {
            const shown: AgentSnapshot = completion.agent(a),
              prior: any = transitions.get(a.block);
            if (
              !prior ||
              prior.state !== shown.state ||
              prior.pid !== a.pid ||
              prior.statusAt !== a.statusAt
            )
              transitions.set(a.block, {
                state: shown.state,
                pid: a.pid,
                statusAt: a.statusAt,
                at: now,
              });
            agentView = {
              slotPresent: !!slot,
              agent: a,
              shown,
              elapsedMs: now - transitions.get(a.block).at,
              selected: isSelectedAgent(a),
            };
          }
        }
        const spec = keyFace({
          action,
          scope,
          backendName: backendName(),
          offline,
          now,
          contextStamp,
          mode,
          target,
          bridge,
          bank,
          gaps: agentView ? 0 : bridge.slotGaps(),
          config,
          agentView,
          feedback: k.feedback,
          notice: k.notice,
          pulse,
          attention,
          hold: scope !== 'herdr-app' && holdActionOf(action) !== null,
        });
        k.presented = capture(k);
        present(
          ctx,
          k,
          k.loadingAt !== undefined && now >= k.loadingAt
            ? {
                ...spec,
                busyFrame: config.animation?.enabled
                  ? Math.floor(now / 250) % 4
                  : 0,
                hold: false,
              }
            : spec,
        );
      }
    }
    async function refreshMetadata(force: any = false) {
      if (metadataBusy) {
        metadataAgain = metadataAgain || force;
        return;
      }
      metadataBusy = true;
      try {
        const source: any = bridge,
          reader: any = metadata;
        if (scope === 'rex')
          await refreshRexClaudeMetadata(source, () => source === bridge);
        const agents: any = await reader.refresh(source.agents || [], force);
        if (source !== bridge) return;
        for (const agent of agents) {
          if (agent.app !== 'codex') continue;
          const live: any = bridge.agents?.find((a: any) =>
            sameTarget(a, agent),
          );
          if (
            live &&
            live.cwd === agent.cwd &&
            (config.backend !== 'herdr' ||
              (live.chatId === agent.chatId &&
                live.nativeIdentity === agent.nativeIdentity)) &&
            !(live.metadataAt > (agent.metadataAt as number))
          )
            for (const field of [
              'chatId',
              'codexHookEpoch',
              'codexBindingEpoch',
              'codexHookNotice',
              'chatName',
              'project',
              'model',
              'effort',
              'collaborationMode',
              'reviewer',
              'runId',
              'backgroundOnly',
              'backgroundIds',
              'backgroundTurnId',
              'activityStatusAt',
              'codexDisplayState',
              'metadataAt',
            ])
              if (
                !(
                  config.backend === 'herdr' &&
                  [
                    'runId',
                    'backgroundOnly',
                    'backgroundIds',
                    'backgroundTurnId',
                    'codexDisplayState',
                    'activityStatusAt',
                  ].includes(field)
                ) &&
                Object.hasOwn(agent, field) &&
                (![
                  'backgroundOnly',
                  'backgroundIds',
                  'backgroundTurnId',
                  'codexDisplayState',
                  'activityStatusAt',
                ].includes(field) ||
                  live.statusAt === agent.statusAt)
              )
                live[field] = (agent as Record<string, any>)[field];
        }
        render();
      } catch {
        // Optional provider availability must never take Rex navigation offline.
      } finally {
        metadataBusy = false;
        if (metadataAgain) {
          metadataAgain = false;
          void refreshMetadata(true);
        }
      }
    }
    let settingsRead:
      | {
          source: any;
          target: any;
          pending: boolean;
          values: any;
          readAt: number;
          chatId?: string | null;
          lastPermissions?: { process: string; label: string };
          lastEffort?: { process: string; label: string };
        }
      | undefined;
    function observeFocusedSettings(source: any, agent: any) {
      const live = source.agents?.find((item: any) =>
        sameNavigationTarget(item, agent),
      );
      if (
        !live?.rexSettings ||
        !(
          ['idle', 'done', 'error'].includes(agent.state) ||
          (agent.app === 'claude-code' &&
            agent.state === 'unknown' &&
            !live.chatId) ||
          (agent.state === 'working' &&
            ['codex', 'claude-code'].includes(agent.app))
        )
      ) {
        settingsRead = undefined;
        return;
      }
      // Discovery returns a fresh pane before render restores cached Codex
      // metadata. Compare the same identity at both ends of the poll.
      if (agent.app === 'codex') hydrateMetadata([live]);
      if (
        settingsRead?.source !== source ||
        !sameNavigationTarget(settingsRead?.target, agent) ||
        settingsRead?.target.cwd !== agent.cwd ||
        settingsRead?.target.state !== agent.state ||
        (agent.app === 'codex' && live.chatId !== settingsRead?.chatId) ||
        (agent.app === 'codex' &&
          agent.state === 'working' &&
          agent.statusAt !== settingsRead?.target.statusAt)
      )
        settingsRead = {
          source,
          target: agent,
          chatId: live.chatId,
          pending: false,
          values: {},
          readAt: 0,
        };
      const record = settingsRead!;
      live.rexSettings = record.values;
      if (record.pending) return;
      record.pending = true;
      // A slow or missing provider frame must not delay the dot or row 2.
      return observeSettings(source, agent)
        .then((values: any) => {
          if (
            settingsRead !== record ||
            bridge !== source ||
            !keys.size ||
            !config.allowClipboardFocus ||
            !sameNavigationTarget(source.lastNavigationTarget, agent)
          )
            return;
          const current = source.agents?.find(
            (item: any) =>
              sameNavigationTarget(item, agent) && item.cwd === agent.cwd,
          );
          if (current) {
            if (agent.app === 'codex') {
              if (record.lastPermissions?.process !== values.process)
                record.lastPermissions = undefined;
              if (values.viewHash && values.process) {
                if (values.permissions)
                  record.lastPermissions = {
                    process: values.process,
                    label: values.permissions,
                  };
                else if (record.lastPermissions)
                  values.permissions = record.lastPermissions.label + '?';
              }
            }
            // A transient repaint may lose the frame, but should not blank a
            // known caption between polls. Never retain a hash or grant input
            // from this display-only grace period, or cross a process change.
            if (
              !values.viewHash &&
              values.process &&
              values.process === record.values.process &&
              clock() - record.readAt < 4500
            ) {
              for (const field of ['model', 'effort', 'permissions', 'plan'])
                values[field] = record.values[field];
              values.permissionsHidden = record.values.permissionsHidden;
            } else if (values.viewHash) record.readAt = clock();
            if (agent.app === 'claude-code') {
              if (
                !values.process ||
                values.process !== record.lastEffort?.process
              )
                record.lastEffort = undefined;
              if (
                values.process &&
                values.viewHash &&
                values.effort &&
                values.effortHidden === false
              )
                record.lastEffort = {
                  process: values.process,
                  label: values.effort,
                };
              if (values.effortHidden && record.lastEffort)
                values.effort = record.lastEffort.label + '?';
            }
            record.values = values;
            current.rexSettings = values;
            render();
          }
        })
        .finally(() => {
          record.pending = false;
        });
    }
    async function followRexSelection(waitForSettings: boolean) {
      if (scope !== 'rex') return;
      if (!config.allowClipboardFocus) {
        settingsRead = undefined;
        bridge.resetDisplayFocus?.();
        bridge.lastNavigationTarget = null;
        return;
      }
      const source = bridge,
        previous = navigationTarget(),
        previousProof = source.lastTarget;
      try {
        const agent = await source.displayedAgent();
        if (source !== bridge || !config.allowClipboardFocus || !keys.size)
          return;
        bridge.lastTarget = sameNavigationTarget(previousProof, agent)
          ? previousProof
          : C.snapshot(agent);
        bridge.lastNavigationTarget = navigationSnapshot(agent);
        bridge.selectionNotice = false;
        if (!sameNavigationTarget(previous, agent)) {
          bridge.draft = null;
          bridge.picker = null;
          if (bridge.claude) bridge.claude.picker = null;
          const slot = bridge.slots.findIndex(
            (entry: any) =>
              entry.session === agent.session && entry.block === agent.block,
          );
          if (slot >= 0) bank = Math.floor(slot / 5);
        }
        const observation = observeFocusedSettings(source, agent);
        if (waitForSettings) await observation;
      } catch {
        if (source !== bridge) return;
        settingsRead = undefined;
        // Shells, closed panes and unavailable native focus never retain a dot.
        bridge.lastNavigationTarget = null;
        bridge.lastTarget = null;
        bridge.draft = null;
        bridge.picker = null;
        if (bridge.claude) bridge.claude.picker = null;
      }
    }
    let discoveryMisses = 0;
    async function refresh(
      forceMetadata: any = false,
      waitForSettings = false,
    ) {
      if (busy || actionBusy || setupBusy) return;
      busy = true;
      let finish!: () => void;
      refreshDone = new Promise((resolve) => {
        finish = resolve;
      });
      try {
        loadConfig();
        await bridge.discover({ allowMissingForeground: scope === 'rex' });
        discoveryMisses = 0;
        await followRexSelection(waitForSettings);
        offline =
          scope === 'herdr-app' &&
          !bridge.delivery.backend.capabilities.has('discover');
        const metadataUpdate = refreshMetadata(forceMetadata);
        // Discovery publishes a provider-free pane. For an already hook-bound
        // selection, finish verifying its identity before repainting row three.
        if (
          waitForSettings ||
          (bridge.lastTarget?.app === 'claude-code' &&
            bridge.lastTarget.nativeIdentity)
        )
          await metadataUpdate;
      } catch (error: unknown) {
        // One timed-out Rex read must not blank the agent row. Keep the last
        // discovery for a single cycle. Nothing is trusted from it: every
        // press still makes its own fresh reads and is refused if Rex does
        // not answer. A second miss in a row, or any other failure (refused,
        // missing, malformed), shows offline at once.
        if (
          scope === 'rex' &&
          !offline &&
          (error as { code?: unknown })?.code === 'REX_TIMEOUT' &&
          discoveryMisses++ === 0 &&
          bridge.agents?.length
        )
          return;
        offline = true;
        bridge.agents = [];
        if (scope === 'rex') {
          settingsRead = undefined;
          bridge.resetDisplayFocus?.();
          bridge.navigationAgents = [];
          bridge.lastNavigationTarget = null;
          bridge.lastTarget = null;
        }
        bridge.draft = null;
        bridge.picker = null;
      } finally {
        busy = false;
        finish();
        render();
      }
    }
    async function performLegacy(a: any, display: any) {
      if (a === 'collapse') {
        const result: any = await bridge.collapse();
        bank = Math.min(
          bank,
          Math.max(0, Math.ceil(bridge.slots.length / 5) - 1),
        );
        return result.removed ? result : undefined;
      } else if (a === 'banknext')
        bank = (bank + 1) % Math.max(1, Math.ceil(bridge.slots.length / 5));
      else if (a === 'bankprev') {
        const banks: number = Math.max(1, Math.ceil(bridge.slots.length / 5));
        bank = (bank + banks - 1) % banks;
      } else if (a.startsWith('agent:') || a === 'attention') {
        if (!display.target || offline) throw Error('No live agent');
        await bridge.focus(display.target);
        if (a === 'attention') {
          const index: number = bridge.slots.findIndex(
            (s: any) =>
              s.session === display.target.session &&
              s.block === display.target.block,
          );
          if (index >= 0) bank = Math.floor(index / 5);
        }
      } else if (a === 'next' || a === 'previous') {
        await bridge.navigate(a === 'next' ? 1 : -1);
        const index: any = bridge.slots.findIndex(
          (s: any) =>
            s.session === bridge.lastTarget?.session &&
            s.block === bridge.lastTarget?.block,
        );
        if (index >= 0) bank = Math.floor(index / 5);
      } else if (['effortIncrease', 'effortDecrease'].includes(a))
        return bridge.adjustEffort(
          a === 'effortDecrease' ? 'decrease' : 'increase',
        );
      else if (['model', 'effort', 'permissions'].includes(a))
        return bridge.cycleControl(a);
      else if (a === 'plan') return bridge.togglePlan();
      else if (a === 'zoom') await bridge.zoom();
      else if (a === 'interrupt') await bridge.interrupt();
      else if (a === 'stopTerminals') return bridge.stopTerminals();
      else if (a === 'steer' || a === 'queue') return bridge.submitRunning(a);
      else if (a === 'claudeToggle') await bridge.questionKey('space');
      else if (a === 'send') await bridge.send();
      else if (a.startsWith('approval'))
        await bridge.approvalKey(
          (
            {
              approvalUp: 'up',
              approvalDown: 'down',
              approvalConfirm: 'enter',
              approvalEscape: 'escape',
            } as Record<string, any>
          )[a],
        );
      else if (
        [
          'up',
          'down',
          'left',
          'right',
          'escape',
          'questionPrev',
          'questionNext',
          'answer',
        ].includes(a)
      )
        await bridge.questionKey(
          (
            {
              questionPrev: 'shift+tab',
              questionNext: 'tab',
              answer: display.target?.claudeCheckboxList ? 'tab' : 'enter',
            } as Record<string, any>
          )[a] || a,
        );
      else await bridge.stage(a);
    }
    async function perform(action: string, display: any) {
      const provider: any = providers.find(
        (provider: import('../domain/backend').AgentProvider) =>
          provider.matches(display.target || {}),
      );
      if (C.needsContext(action) && provider && bridge.delivery) {
        return provider.perform(action, {
          press: display,
          backend: bridge.delivery.backend,
          operations: { execute: performLegacy },
        });
      }
      return performLegacy(action, display);
    }
    async function press(ctx: any, display: any) {
      const k: any = keys.get(ctx);
      if (!k) return;
      if (
        scope === 'herdr-app' &&
        !bridge.delivery.backend.capabilities.has('discover')
      )
        return;
      display = display || k.presented || capture(k);
      if (busy) await refreshDone;
      const a: any = display.action;
      if (informationalActions.has(a)) return;
      let completed: boolean = false;
      let refreshSettings = false;
      actionBusy = true;
      activePress = { ctx, display };
      try {
        let result: any;
        // A press that sat behind slow work no longer matches the user's intent.
        if (
          typeof display.pressedAt === 'number' &&
          pressClock(scope) - display.pressedAt > QUEUE_STALE_MS
        )
          throw Object.assign(Error('Press expired; press again'), {
            keyLabel: 'Press again',
          });
        guards.preflight(display, C.needsContext(a));
        if (
          bridge.delivery?.backend.id === 'herdr-app' &&
          ![
            'collapse',
            'banknext',
            'more',
            'questions',
            'prompts',
            'back',
          ].includes(a)
        )
          assertVerifiedControl(bridge.delivery.backend, display);
        if (
          a === 'interrupt' &&
          display.target?.app === 'claude-code' &&
          C.modeOf(display.target) === 'ready'
        )
          return;
        if (
          display.target?.rexSettings &&
          scope === 'rex' &&
          (rexSettingsAction(a) ||
            (a === 'interrupt' &&
              display.target.state === 'working' &&
              !display.target.chatId)) &&
          (display.target.app === 'codex' ||
            (display.target.app === 'claude-code' &&
              display.target.rexSettings.process &&
              (rexSettingsAction(a) ||
                (a === 'interrupt' && !display.target.chatId))))
        ) {
          result = await performRexKeyboard(bridge, display);
        } else if (
          display.target?.rexSettings &&
          scope === 'rex' &&
          display.target.app === 'claude-code' &&
          ['plan', 'permissions'].includes(a)
        ) {
          result = await bridge.withContext(display, () =>
            cycleClaudeMode(bridge, display.target),
          );
        } else if (C.needsContext(a)) {
          result = await bridge.withContext(display, () => perform(a, display));
        } else result = await perform(a, display);
        guards.postflight(display);
        if (
          settingsRead &&
          display.target?.app === 'claude-code' &&
          sameNavigationTarget(settingsRead.target, display.target) &&
          settingsRead.values.process &&
          settingsRead.values.process === display.target.rexSettings?.process
        ) {
          if (a === 'effort' && result?.label)
            settingsRead.lastEffort = {
              process: settingsRead.values.process,
              label: result.label,
            };
          if (a === 'model')
            settingsRead.lastEffort = result?.appliedEffort
              ? {
                  process: settingsRead.values.process,
                  label: result.appliedEffort,
                }
              : undefined;
          if (a === 'model' || a === 'effort') {
            // A poll begun before the picker closed must not publish its old
            // digest for the next key. Keep only the process-bound effort hint.
            settingsRead = {
              ...settingsRead,
              values: {},
              readAt: 0,
              pending: false,
            };
            refreshSettings = true;
          }
        }
        if (
          a === 'permissions' &&
          display.target?.app === 'codex' &&
          result?.label &&
          settingsRead?.values.process &&
          settingsRead.values.process === display.target.rexSettings?.process &&
          sameNavigationTarget(settingsRead.target, display.target) &&
          settingsRead.chatId === display.target.chatId
        ) {
          // Ignore any passive picker read begun before the new selection.
          settingsRead = {
            ...settingsRead,
            pending: false,
            lastPermissions: {
              process: settingsRead.values.process,
              label: result.label,
            },
          };
        }
        if (
          display.target?.app === 'codex' &&
          rexSettingsAction(a) &&
          settingsRead
        ) {
          settingsRead = {
            ...settingsRead,
            pending: false,
            values: {},
            readAt: 0,
          };
          refreshSettings = true;
        }
        completed = true;
        k.feedback = null;
        if (result)
          k.notice = {
            until: clock() + 2500,
            label: result.label,
            action: a,
            stamp: display.stamp,
          };
      } catch (error: unknown) {
        k.notice = null;
        k.feedback = {
          until: clock() + 10000,
          message: keyMessage(
            (error as Error & { keyLabel?: string }).keyLabel ??
              (error as Error).message,
          ),
          action: a,
          stamp: display.stamp,
        };
        inspectorMessage = String(
          (
            error as Error & {
              code?: string;
            }
          ).message,
        )
          .replace(/[\x00-\x1f\x7f]/g, '')
          .slice(0, 160);
        render();
        emit('showAlert', ctx, {});
      } finally {
        actionBusy = false;
        activePress = null;
      }
      if (
        completed &&
        display.target?.app === 'claude-code' &&
        !display.target.claudePicker &&
        ['up', 'down', 'approvalUp', 'approvalDown'].includes(a)
      ) {
        render();
        return;
      }
      const waitingAction: boolean = [
        'up',
        'down',
        'left',
        'right',
        'escape',
        'questionPrev',
        'questionNext',
        'answer',
        'claudeToggle',
        'approvalUp',
        'approvalDown',
        'approvalConfirm',
        'approvalEscape',
      ].includes(a);
      if (waitingAction && display.target?.app === 'claude-code') {
        const source: any = bridge;
        try {
          const live: any = await source.agent(display.target);
          if (source === bridge) {
            const index: number = (source.agents as any[]).findIndex(
              (item: any) => sameTarget(item, display.target),
            );
            if (index >= 0) {
              if (live && sameTarget(live, display.target))
                (source.agents as any[])[index] = live;
              else (source.agents as any[]).splice(index, 1);
            }
          }
        } catch {
          void refresh();
        }
        render();
      } else await refresh(true, refreshSettings);
      render();
    }
    async function initialize() {
      if (!keys.size) return;
      await refresh();
      if (!startupSelectionRead && config.backend === 'herdr') {
        startupSelectionRead = true;
        try {
          await bridge.focused();
        } catch {}
      }
      render();
    }
    function inspectorStatus(context: any, message?: string | undefined) {
      if (message !== undefined) inspectorMessage = message;
      const a: any = selected(),
        agents: any = bridge.agents || [];
      emit('sendToPropertyInspector', context, {
        kind: 'status',
        profileScope: scope,
        profileName: backendName(),
        backend: config.backend || 'rex',
        preferences: preferences.view(config),
        offline,
        agents: agents.length,
        codex: agents.filter((a: any) => a.app === 'codex').length,
        claude: agents.filter((a: any) => a.app === 'claude-code').length,
        claudeIdentified: agents.filter(
          (a: any) => a.app === 'claude-code' && a.nativeVerified,
        ).length,
        metadata: agents.filter((a: any) => a.app === 'codex' && a.chatId)
          .length,
        selected: a
          ? {
              app: a.app,
              state: a.state,
              mode:
                a.app === 'claude-code' ? null : a.collaborationMode || null,
              ...(a.codexHookEpoch ? { identitySource: 'hook' } : {}),
              ...(a.codexHookNotice
                ? { identityMessage: a.codexHookNotice }
                : {}),
              ...(a.app === 'claude-code'
                ? {
                    identityMessage: a.claudeError || '',
                    nativeVerified: a.nativeVerified === true,
                  }
                : {}),
              ...(config.backend === 'herdr' && a.app !== 'claude-code'
                ? {
                    identityMessage: a.nativeError || '',
                    nativeVerified: a.nativeVerified === true,
                  }
                : {}),
            }
          : null,
        selectionNotice: !!bridge.selectionNotice,
        setupBusy,
        message: inspectorMessage || settingsError || storeError,
      });
    }
    async function inspectorRequest(e: any) {
      if (!keys.has(e.context)) return;
      if (
        scope === 'herdr-app' &&
        !['status', 'preferences'].includes(e.payload?.kind)
      ) {
        inspectorStatus(
          e.context,
          'Herdr App preview; native setup unavailable',
        );
        return;
      }
      if (e.payload?.kind === 'doctor') {
        const checks = await (dependencies.diagnostics || diagnostics)({
          selected: selected(),
          blocker:
            scope === 'rex'
              ? controlBlocker(selected(), {
                  visibleChecks: config.allowClipboardFocus === true,
                  claudeEnabled: config.claude?.enabled === true,
                })
              : null,
          online: !offline,
          model: e.payload.model,
          herdr: scope === 'herdr',
          rexPath: config.rexPath,
        });
        // Only the Herdr profile probes Herdr session sockets.
        const sessions =
          scope === 'herdr'
            ? await (dependencies.herdrSessions || sessionChoices)()
            : [];
        emit('sendToPropertyInspector', e.context, {
          kind: 'doctor',
          checks: [...checks, ...sessionChecks(sessions)],
          sessions,
        });
        return;
      }
      if (
        [
          'claudePreview',
          'claudeApply',
          'claudeUndo',
          'removeIntegrations',
          'claudeRestoreStatusLine',
        ].includes(e.payload?.kind)
      ) {
        const previewing = [
          'claudePreview',
          'removeIntegrations',
          'claudeRestoreStatusLine',
        ].includes(e.payload.kind);
        try {
          if (previewing) {
            const diff = integrationSetup.preview(
              e.payload.kind === 'removeIntegrations',
              e.payload.kind === 'claudeRestoreStatusLine',
            );
            emit('sendToPropertyInspector', e.context, {
              kind: 'claudePreview',
              ...diff,
            });
          } else if (e.payload.kind === 'claudeApply') integrationSetup.apply();
          else integrationSetup.undo();
          inspectorStatus(
            e.context,
            previewing
              ? 'Review the exact changes below, then click Apply'
              : 'Integration updated; no agents restarted',
          );
        } catch {
          inspectorStatus(
            e.context,
            'Integration settings changed or unavailable; preview again. See docs/CLAUDE.md for recovery.',
          );
        }
        return;
      }
      if (e.payload?.kind === 'preferences') {
        try {
          saved = preferences.update(saved, scope, e.payload.preferences);
          persist();
          applyAllSettings();
          inspectorStatus(e.context, 'Preferences saved');
        } catch (error: unknown) {
          inspectorStatus(
            e.context,
            (
              error as Error & {
                code?: string;
              }
            ).message,
          );
        }
        return;
      }
      if (e.payload?.kind === 'status') {
        inspectorStatus(e.context);
        return;
      }
      if (e.payload?.kind !== 'setupFooter') return;
      if (setupBusy) {
        inspectorStatus(e.context, 'Setup already running');
        return;
      }
      const a: any = selected();
      setupBusy = true;
      // The explicit setup owns this busy interval; captured ordinary key presses
      // still carry setupBusy=true and refuse after the interval ends.
      activePress = {
        ctx: e.context,
        display: { ...capture(keys.get(e.context)), setupBusy: false },
      };
      inspectorStatus(e.context, 'Checking the selected Codex identity…');
      try {
        if (config.backend === 'herdr')
          throw Error(
            'Run /title thread-id in Codex and enable title matching in preferences',
          );
        if (!config.allowClipboardFocus)
          throw Error('Enable visible-pane checks first');
        if (a?.app !== 'codex' || !['idle', 'done'].includes(a.state))
          throw Error('Select a ready Codex agent on the deck');
        const display: {
          target: {
            [k: string]: any;
          } | null;
          verifyChat: boolean;
        } = { target: C.snapshot(a), verifyChat: false };
        await bridge.withContext(display, () =>
          (
            dependencies.setupCodex ||
            require('../agents/codex/setup-daemon').check
          )(bridge, a),
        );
        await refresh(true);
        inspectorStatus(
          e.context,
          'Codex session identity verified. Nothing was changed.',
        );
      } catch (error: unknown) {
        inspectorStatus(
          e.context,
          String(
            (
              error as Error & {
                code?: string;
              }
            ).message,
          )
            .replace(/[\x00-\x1f\x7f]/g, '')
            .slice(0, 160),
        );
      } finally {
        setupBusy = false;
        activePress = null;
        inspectorStatus(e.context);
      }
    }
    function applySettings() {
      const hadConsent: any = config.allowClipboardFocus;
      loadConfig();
      if (scope === 'rex' && hadConsent && !config.allowClipboardFocus) {
        settingsRead = undefined;
        bridge.lastTarget = null;
        bridge.lastNavigationTarget = null;
        bridge.draft = null;
        bridge.picker = null;
      } else if (
        keys.size &&
        !startupSelectionRead &&
        (scope === 'herdr' || (!hadConsent && config.allowClipboardFocus))
      )
        queue = queue.then(initialize).catch(() => {});
      render();
    }
    function detach(context: any) {
      keys.delete(context);
      if (!keys.size) {
        visibility++;
        bridge.draft = null;
        bridge.picker = null;
        if (bridge.claude) bridge.claude.picker = null;
        completion.update(navigationAgents(), null, clock());
      }
    }
    function attach(context: any, payload: any) {
      const first: boolean = !keys.size;
      if (first) visibility++;
      keys.set(context, {
        settings: payload.settings || {},
        coordinates: payload.coordinates,
        appearance: ++appearanceSequence,
      });
      render();
      if (first) queue = queue.then(initialize).catch(() => {});
    }
    return {
      get setupBusy() {
        return setupBusy;
      },
      get bridge() {
        return bridge;
      },
      get metadata() {
        return metadata;
      },
      keys,
      mapping,
      render,
      refresh,
      refreshMetadata,
      press,
      selected,
      inspectorRequest,
      initialize,
      applySettings,
      attach,
      detach,
      settled,
      ready: settled,
      getPage: () => page,
      getBank: () => bank,
      setBank: (value: any) => (bank = value),
    };
  }
  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        event: arg('-registerEvent'),
        uuid: arg('-pluginUUID'),
      }),
    );
    ws.send(
      JSON.stringify({
        event: 'getGlobalSettings',
        context: arg('-pluginUUID'),
      }),
    );
    for (const runtime of controllers.values())
      if (runtime.keys.size)
        queue = queue.then(runtime.initialize).catch(() => {});
  });
  function dispatch(e: any) {
    try {
      if (e.event === 'willDisappear') gestures.cancel(e.context);
      if (e.event === 'didReceiveGlobalSettings') {
        try {
          const input: any = boundary.validate(
            'globalSettings',
            e.payload?.settings || {},
          );
          if (![2, 3].includes(input.version) && loadedV2) return;
          const incoming:
            | {
                version: number;
                revision: number;
                shared: {};
                profiles: {
                  rex: {};
                  herdr: {};
                };
              }
            | {
                version: number;
                revision: any;
                shared: {};
                profiles: {
                  [k: string]: {};
                };
              } = preferences.store(input);
          if (
            [2, 3].includes(input.version) &&
            incoming.revision < saved.revision
          )
            return;
          saved = incoming;
          storeError = '';
          if ([2, 3].includes(input.version)) loadedV2 = true;
          else persist();
          applyAllSettings();
        } catch {
          storeError =
            'Saved profile preferences invalid; keeping the last valid settings';
          for (const runtime of controllers.values()) runtime.render();
        }
        return;
      }
      if (e.event === 'willAppear' || e.event === 'didReceiveSettings') {
        if (e.event === 'didReceiveSettings' && !owners.has(e.context)) return;
        const scope: any = preferences.scopeOf(e.payload?.settings),
          prior: any = owners.get(e.context);
        if (prior && prior !== scope) {
          gestures.cancel(e.context);
          getController(prior).detach(e.context);
        }
        if (!scope) {
          owners.delete(e.context);
          emit('setImage', e.context, {
            image: frames.image(PROFILE_SETUP_ERROR),
            target: 0,
          });
          if (e.event === 'willAppear')
            emit('setTitle', e.context, { title: '', target: 0 });
          return;
        }
        const runtime: any = getController(scope);
        owners.set(e.context, scope);
        if (e.event === 'didReceiveSettings' && prior === scope) {
          const k: any = runtime.keys.get(e.context);
          if (k) k.settings = e.payload.settings || {};
          runtime.render();
        } else runtime.attach(e.context, e.payload);
        return;
      }
      const scope: any = owners.get(e.context);
      if (!scope) return;
      const runtime: any = getController(scope);
      if (e.event === 'willDisappear') {
        runtime.detach(e.context);
        owners.delete(e.context);
        return;
      }
      if (e.event === 'sendToPlugin') {
        // Revocation must invalidate an in-flight App request before its final
        // write; it cannot wait behind that request in the ordinary event queue.
        if (scope === 'herdr-app' && e.payload?.kind === 'preferences') {
          void runtime.inspectorRequest(e).catch(() => {});
          return;
        }
        const appearance: any = runtime.keys.get(e.context)?.appearance;
        queue = queue
          .then(() =>
            owners.get(e.context) === scope &&
            runtime.keys.get(e.context)?.appearance === appearance
              ? runtime.inspectorRequest(e)
              : undefined,
          )
          .catch(() => {});
        return;
      }
      if (e.event === 'keyUp') gestures.up(e.context);
      if (e.event === 'keyDown') {
        const k: any = runtime.keys.get(e.context),
          shown: any = k?.presented,
          display: any = shown
            ? {
                ...shown,
                pressedAt: pressClock(scope),
                setupBusy: runtime.setupBusy,
              }
            : undefined;
        if (k?.loadingAt !== undefined) {
          k.loadingAt = clock();
          runtime.render();
          return;
        }
        if (!shown || informationalActions.has(shown.action)) {
          gestures.cancel(e.context);
          return;
        }
        // The herdr-app scope keeps its per-control records: no holds there.
        const hold: string | null =
          shown && scope !== 'herdr-app' ? holdActionOf(shown.action) : null;
        gestures.down(e.context, hold !== null, (kind) => {
          // Both gestures act on the context presented at key down.
          const pressed: any =
            kind === 'hold' && display ? { ...display, action: hold } : display;
          // Reserve this key appearance before queueing so a second keyDown
          // cannot replay the action after the first one changes the screen.
          k.loadingAt = clock() + LOADING_DELAY_MS;
          queue = queue
            .then(async () => {
              try {
                if (
                  runtime.keys.get(e.context) === k &&
                  owners.get(e.context) === scope
                )
                  await runtime.press(e.context, pressed);
              } finally {
                delete k.loadingAt;
                if (runtime.keys.get(e.context) === k) runtime.render();
              }
            })
            .catch(() => {});
        });
      }
    } catch {}
  }
  ws.on('message', (raw: any) => {
    try {
      dispatch(boundary.parse('hostEvent', raw));
    } catch {}
  });
  ws.on('close', () => dependencies.onClose?.());
  ws.on('error', () => dependencies.onError?.());
  schedule(() => {
    for (const runtime of controllers.values())
      if (runtime.keys.size) void runtime.refresh();
  }, 2000);
  schedule(() => {
    for (const runtime of controllers.values())
      if (runtime.keys.size) runtime.render();
  }, 250);
  return {
    controllers,
    getController,
    settled,
    receive: (event: any) => {
      try {
        dispatch(boundary.validate('hostEvent', event));
      } catch {}
    },
  };
}
module.exports = { createApplication };

export { createApplication };
