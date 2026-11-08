// @ts-check
/** @typedef {import("../domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../domain/types").Config} Config */
/** @typedef {import("../domain/types").PressContext} PressContext */
'use strict';
const { pluginDirectory } = require("../platform/paths.ts");

const fs = require('fs'),
  path = require('path'),
  WebSocket = require('ws');
const { Bridge } = require('./session'),
  { svg, pulse } = require('../render/visuals');
const {
    agentLines,
    modelLines,
    modeLines,
    effortLines,
    reviewerLines,
    sameTarget,
  } = require('../domain/labels'),
  { AgentMetadata } = require('../agents/codex/metadata');
const C = require('../guards/context');
const { controlAccent } = require('../render/signal');
const { CompletionDisplay } = require('../render/completion');
const preferences = require('./preferences');
const args = process.argv.slice(2),
  arg = /** @param {any} k */ (k) => args[args.indexOf(k) + 1],
  ws = new WebSocket('ws://127.0.0.1:' + arg('-port'));
const emit =
  /** @param {any} event
   * @param {any} context
   * @param {any} payload */
  (event, context, payload) => {
    if (ws.readyState === 1)
      ws.send(JSON.stringify({ event, context, payload }));
  };
let saved = preferences.store(),
  storeError = '',
  loadedV2 = false,
  queue = Promise.resolve(),
  sequence = 0,
  appearanceSequence = 0;
const controllers = new Map(),
  owners = new Map();
async function settled() {
  let pending;
  do {
    pending = queue;
    await pending;
  } while (pending !== queue);
}
function persist() {
  loadedV2 = true;
  emit('setGlobalSettings', arg('-pluginUUID'), preferences.serialize(saved));
}
/** @param {any} scope */
function getController(scope) {
  if (!['rex', 'herdr'].includes(scope))
    throw Error('Unknown controller profile');
  if (!controllers.has(scope)) controllers.set(scope, createController(scope));
  return controllers.get(scope);
}
function applyAllSettings() {
  for (const runtime of controllers.values()) runtime.applySettings();
}
/** @param {any} scope */
function createController(scope) {
  const configPath = path.join(pluginDirectory, 'config.json');
  let diskConfig = JSON.parse(/** @type {any} */ (fs.readFileSync(configPath))),
    config = preferences.profileConfig(diskConfig, saved, scope);
  let /** @type {any} */ activePress = null,
    visibility = 0,
    actionBusy = false,
    settingsError = '',
    setupBusy = false,
    inspectorMessage = '';
  const backendKey =
    /** @param {any} c */
    (c) =>
      c.backend +
      '|claude:' +
      String(c.claude?.enabled === true) +
      '|' +
      (c.backend === 'herdr'
        ? [c.herdr?.socketPath || '', c.herdr?.titleIdentity === true].join('|')
        : '');
  function assertVisible() {
    if (!activePress) return;
    const { ctx, display } = activePress,
      k = keys.get(ctx);
    if (
      !k ||
      display.appearance !== k.appearance ||
      display.visibility !== visibility
    )
      throw Error('Profile changed; no further input sent');
  }
  /** @param {any} c */
  function makeBridge(c) {
    const b =
      c.backend === 'herdr'
        ? new (require('./herdr-session').HerdrBridge)(c)
        : new Bridge(c);
    /** @type {any} */ (b).backendKey = backendKey(c);
    /** @type {any} */ (b).generation = ++sequence;
    const focused = b.focused.bind(b);
    b.focused =
      /** @param {...any} args */
      async (...args) => {
        assertVisible();
        const result = await /** @type {(...args: any[]) => Promise<any>} */ (
          focused
        )(...args);
        assertVisible();
        return result;
      };
    const run = b.run.bind(b);
    b.run =
      /** @param {string[]} args
       * @param {...any} rest */
      (args, ...rest) => {
        if (['send', 'send-key', 'focus', 'zoom', '-C'].includes(args[0]))
          assertVisible();
        return run(args, ...rest);
      };
    if (c.backend === 'herdr') {
      const connect = /** @type {any} */ (b).connect?.bind(b);
      if (connect)
        /** @type {any} */ (b).connect = async () => {
          const rpc = await connect(),
            request = rpc.request.bind(rpc);
          rpc.request =
            /** @param {string} method
             * @param {any} params */
            (method, params) => {
              if (
                ['agent.focus', 'agent.send_keys', 'pane.zoom'].includes(method)
              )
                assertVisible();
              return request(method, params);
            };
          return rpc;
        };
    }
    return b;
  }
  let bridge = makeBridge(config),
    metadata = new AgentMetadata(bridge);
  const completion = new CompletionDisplay(),
    keys = new Map(),
    transitions = new Map();
  let page = 0,
    bank = 0,
    busy = false,
    offline = true,
    metadataBusy = false,
    metadataAgain = false,
    startupSelectionRead = false,
    contextState = /** @type {{stamp: string | null, armedAt: number}} */ ({
      stamp: null,
      armedAt: 0,
    });
  function loadConfig() {
    try {
      diskConfig = JSON.parse(/** @type {any} */ (fs.readFileSync(configPath)));
      settingsError = '';
    } catch {
      settingsError = 'Settings file invalid; using the last valid defaults';
    }
    const next = preferences.profileConfig(diskConfig, saved, scope);
    if (backendKey(next) !== /** @type {any} */ (bridge).backendKey) {
      if (actionBusy || setupBusy) return;
      bridge = makeBridge(next);
      metadata = new AgentMetadata(bridge);
      if (metadataBusy) metadataAgain = true;
      startupSelectionRead = false;
      bank = 0;
      page = 0;
      transitions.clear();
      contextState = /** @type {{stamp: string | null, armedAt: number}} */ ({
        stamp: null,
        armedAt: 0,
      });
      for (const k of keys.values()) {
        k.notice = null;
        k.feedback = null;
      }
    }
    config = next;
    bridge.config = config;
  }
  const backendName = () => (scope === 'herdr' ? 'Herdr' : 'Rex');
  const clean =
    /** @param {any} s */
    (s) =>
      String(s || '')
        .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
        .slice(0, 15);
  function selected() {
    return bridge.agents?.find((a) => sameTarget(bridge.lastTarget, a));
  }
  /** @param {any} k */
  function mapping(k) {
    const override = k.settings.action;
    if (override) {
      if (override === 'tools') return 'questions';
      if (
        [
          'planPrompt',
          'modelPicker',
          'effortPicker',
          'previous',
          'bankprev',
        ].includes(override)
      )
        return 'none';
      return override;
    }
    const { column: c, row: r } = k.coordinates;
    return r === 0 ? 'agent:' + c : C.layout(page, selected())[(r - 1) * 5 + c];
  }
  function bankLines() {
    if (offline) return ['Agents ▶', backendName() + ' offline'];
    const visible = bridge.slots
      .slice(bank * 5, bank * 5 + 5)
      .filter((s) =>
        bridge.agents?.some(
          (a) => a.session === s.session && a.block === s.block,
        ),
      ).length;
    const total = Math.max(1, Math.ceil(bridge.slots.length / 5)),
      outside = Math.max(0, (bridge.agents?.length || 0) - visible);
    return [
      'Agents ▶',
      ...(total > 1 ? [`bank ${bank + 1}/${total}`] : []),
      ...(outside
        ? [`${outside} off-page`]
        : bridge.agents?.length
          ? []
          : ['No agents']),
    ];
  }
  /** @param {any} k */
  function capture(k) {
    const target = selected(),
      action = mapping(k),
      contextStamp = C.stamp(target, page);
    return {
      setupBusy,
      scope,
      appearance: k.appearance,
      visibility,
      generation: /** @type {any} */ (bridge).generation,
      action,
      page,
      backendKey: /** @type {any} */ (bridge).backendKey,
      stamp: contextStamp,
      target: C.snapshot(action.startsWith('agent:') ? k.target : target),
      armedAt: contextState.armedAt,
      verifyChat: C.needsChat(action, target),
    };
  }
  function render() {
    metadata.hydrate(bridge.agents || []);
    const now = Date.now(),
      target = selected(),
      mode = C.modeOf(target),
      contextStamp = C.stamp(target, page);
    completion.update(bridge.agents || [], target, now);
    if (contextState.stamp !== contextStamp)
      contextState = { stamp: contextStamp, armedAt: now + 350 };
    for (const [ctx, k] of keys) {
      const action = mapping(k);
      let icon =
        /** @type {Record<string, any>} */ ({
          effortIncrease: 'blank',
          effortDecrease: 'blank',
          plan: 'blank',
          permissions: 'reviewer',
          more: 'more',
          questions: 'more',
          prompts: 'more',
          back: 'previous',
          questionPrev: 'previous',
          questionNext: 'next',
          answer: 'send',
          approvalUp: 'up',
          approvalDown: 'down',
          approvalConfirm: 'permissions',
          approvalEscape: 'escape',
          none: 'blank',
          inputInfo: 'blank',
          status: 'blank',
          claudeInfo: 'claude-code',
          claudeModeInfo: 'blank',
          claudeToggle: 'permissions',
        })[action] || action;
      let lines = [],
        color = '#233a50',
        p = 0,
        badge = '';
      if (action.startsWith('agent:')) {
        const slot = bridge.slots[bank * 5 + Number(action.split(':')[1])],
          a = bridge.agents?.find(
            (a) => a.block === slot?.block && a.session === slot?.session,
          );
        k.target = a;
        if (a) {
          const shown = completion.agent(a),
            prior = transitions.get(a.block);
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
          icon = a.app;
          lines = agentLines(shown, config.aliases);
          color = C.isBackground(shown)
            ? '#126b78'
            : config.palette[shown.state === 'idle' ? 'ready' : shown.state] ||
              config.palette.unknown;
          p = pulse(
            C.isBackground(shown) ? 'idle' : shown.state,
            now - transitions.get(a.block).at,
            config.animation,
          );
          if (sameTarget(bridge.lastTarget, a)) badge = 'selected';
        } else {
          icon = 'empty';
          lines = offline
            ? [backendName() + ' offline', 'UNKNOWN']
            : slot
              ? ['Closed']
              : ['No agent'];
          color = offline ? config.palette.error : config.palette.idle;
        }
      } else {
        const gaps = bridge.slotGaps(),
          names = {
            collapse: [
              'Collapse',
              ...(offline
                ? [backendName() + ' offline']
                : gaps
                  ? [`${gaps} gap${gaps === 1 ? '' : 's'}`]
                  : []),
            ],
            banknext: bankLines(),
            next: ['Next agent'],
            model: modelLines(bridge),
            effort: effortLines(bridge),
            effortIncrease: ['Effort +'],
            effortDecrease: ['Effort −'],
            permissions: reviewerLines(bridge),
            plan: modeLines(bridge),
            interrupt: [
              'Interrupt',
              mode === 'working' ? 'running' : 'not running',
            ],
            stopTerminals: [
              'Stop terminals',
              `${target?.backgroundIds?.length || 0} running`,
            ],
            steer: ['Steer', 'typed message'],
            queue: ['Queue', 'typed message'],
            zoom: ['Zoom'],
            up: ['Up'],
            down: ['Down'],
            left: ['Left'],
            right: ['Right'],
            questionPrev: ['Shift+Tab', 'question'],
            questionNext: ['Tab', 'question'],
            answer: target?.claudePicker
              ? ['Apply', 'this session']
              : target?.claudeCheckboxList
                ? ['Review', 'answers']
                : target?.claudeQuestionReview
                  ? ['Submit', 'answers']
                  : ['Confirm', 'Enter'],
            escape: ['Esc', 'question'],
            approvalUp: ['Up', 'choice'],
            approvalDown: ['Down', 'choice'],
            approvalConfirm: ['Confirm', 'shown choice'],
            approvalEscape: ['Esc', 'choice'],
            review: ['Review', 'draft'],
            tests: ['Tests', 'draft'],
            continue: ['Continue', 'draft'],
            send: bridge.draft
              ? ['Send', bridge.draft.action]
              : ['Send', 'no draft'],
            more: [
              `Page ${page + 1}/3`,
              ['Home', 'Questions', 'Prompts'][page],
              page === 0
                ? {
                    ready: 'Ready',
                    working: 'Working',
                    background: 'Background',
                    question: 'Question',
                    approval: 'Choice',
                    unknown: target ? 'Check ' + backendName() : 'Select agent',
                  }[mode]
                : 'next page',
            ],
            questions: ['Questions'],
            prompts: ['Prompts'],
            back: ['Back', 'Questions'],
            none: [],
            claudeToggle: ['Toggle', 'Space'],
            claudeInfo: [
              'Claude Code',
              config.claude?.enabled ? 'Experimental' : 'Set up hooks',
            ],
            claudeModeInfo: modeLines(bridge),
            inputInfo: ['Use Herdr', 'keyboard'],
            status: target
              ? [
                  'Check ' + backendName(),
                  target.app === 'claude-code'
                    ? target.claudeError ||
                      (!target.claudeControlsEnabled ? 'Enable Claude' : '')
                    : target.kind === 'auth'
                      ? 'Authentication'
                      : '',
                ]
              : [bridge.selectionNotice ? 'Reselect' : 'Select', 'agent'],
          };
        lines = /** @type {Record<string, any>} */ (names)[action] || [
          action.toUpperCase(),
        ];
        if (
          (action === 'collapse' && (offline || !gaps)) ||
          (action === 'interrupt' && mode !== 'working') ||
          action === 'none'
        )
          color = '#38414b';
        if (
          action === 'stopTerminals' ||
          (action === 'interrupt' && mode === 'working')
        )
          color = '#813c42';
        if (['steer', 'queue'].includes(action) && !target?.runId) {
          color = '#38414b';
          lines = [action === 'steer' ? 'Steer' : 'Queue', 'loading run'];
        }
        if (action.startsWith('approval')) color = '#78551e';
        if (action === 'send' && bridge.draft) color = '#416428';
        if (
          ([
            'up',
            'down',
            'left',
            'right',
            'escape',
            'questionPrev',
            'questionNext',
            'answer',
          ].includes(action) &&
            mode !== 'question') ||
          (action === 'permissions' && mode !== 'ready')
        )
          color = '#38414b';
        if (
          k.feedback &&
          k.feedback.action === action &&
          k.feedback.stamp === contextStamp &&
          now < k.feedback.until
        ) {
          lines = ['Unavailable', k.feedback.message];
          color = '#893748';
        }
      }
      if (
        action !== 'plan' &&
        !['effort', 'effortIncrease', 'effortDecrease'].includes(action) &&
        k.notice &&
        k.notice.action === action &&
        k.notice.stamp === contextStamp &&
        now < k.notice.until
      ) {
        lines = [
          action === 'stopTerminals'
            ? 'Stop terminals'
            : action === 'collapse'
              ? 'Collapse'
              : action === 'permissions'
                ? 'Reviewer'
                : action === 'steer'
                  ? 'Steer'
                  : action === 'queue'
                    ? 'Queue'
                    : ['effortIncrease', 'effortDecrease'].includes(action)
                      ? 'Effort'
                      : action === 'plan'
                        ? 'Mode'
                        : 'Model',
          k.notice.label,
        ];
        color = '#2b654c';
      }
      k.presented = capture(k);
      const img =
        'data:image/svg+xml;base64,' +
        Buffer.from(
          svg({
            icon,
            lines,
            color,
            pulse: p,
            badge,
            accent: controlAccent(action, color),
            style: config.appearance?.style || 'signal',
            textOnly:
              lines.length === 1 &&
              ['effortIncrease', 'effortDecrease', 'plan'].includes(action),
            agent: action.startsWith('agent:'),
          }),
        ).toString('base64');
      if (img !== k.lastImage) {
        emit('setImage', ctx, { image: img, target: 0 });
        emit('setTitle', ctx, { title: '', target: 0 });
        k.lastImage = img;
      }
    }
  }
  /** @param {any} [force] */
  async function refreshMetadata(force = false) {
    if (metadataBusy) {
      metadataAgain = metadataAgain || force;
      return;
    }
    metadataBusy = true;
    try {
      const source = bridge,
        reader = metadata,
        agents = await reader.refresh(source.agents || [], force);
      if (source !== bridge) return;
      for (const agent of agents) {
        if (agent.app !== 'codex') continue;
        const live = bridge.agents?.find((a) => sameTarget(a, agent));
        if (
          live &&
          live.cwd === agent.cwd &&
          (config.backend !== 'herdr' ||
            (live.chatId === agent.chatId &&
              live.nativeIdentity === agent.nativeIdentity)) &&
          !(live.metadataAt > /** @type {number} */ (agent.metadataAt))
        )
          for (const field of [
            'chatId',
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
                  'activityStatusAt',
                ].includes(field)
              ) &&
              Object.hasOwn(agent, field) &&
              (![
                'backgroundOnly',
                'backgroundIds',
                'backgroundTurnId',
                'activityStatusAt',
              ].includes(field) ||
                live.statusAt === agent.statusAt)
            )
              live[field] = /** @type {Record<string, any>} */ (agent)[field];
      }
      render();
    } finally {
      metadataBusy = false;
      if (metadataAgain) {
        metadataAgain = false;
        void refreshMetadata(true);
      }
    }
  }
  /** @param {any} [forceMetadata] */
  async function refresh(forceMetadata = false) {
    if (busy || actionBusy) return;
    busy = true;
    try {
      loadConfig();
      await bridge.discover();
      offline = false;
      void refreshMetadata(forceMetadata);
    } catch {
      offline = true;
      bridge.agents = [];
      bridge.draft = null;
      bridge.picker = null;
    } finally {
      busy = false;
      render();
    }
  }
  /** @param {any} a
   * @param {any} display */
  async function perform(a, display) {
    if (a === 'more') page = (page + 1) % 3;
    else if (a === 'questions') page = 1;
    else if (a === 'prompts') page = 2;
    else if (a === 'back') page = 0;
    else if (a === 'collapse') {
      const result = await bridge.collapse();
      bank = Math.min(
        bank,
        Math.max(0, Math.ceil(bridge.slots.length / 5) - 1),
      );
      return result.removed ? result : undefined;
    } else if (a === 'banknext')
      bank = (bank + 1) % Math.max(1, Math.ceil(bridge.slots.length / 5));
    else if (a.startsWith('agent:')) {
      if (!display.target || offline) throw Error('No live agent');
      await bridge.focus(display.target);
    } else if (a === 'next') {
      await bridge.navigate(1);
      const index = bridge.slots.findIndex(
        (s) =>
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
        /** @type {Record<string, any>} */ ({
          approvalUp: 'up',
          approvalDown: 'down',
          approvalConfirm: 'enter',
          approvalEscape: 'escape',
        })[a],
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
        /** @type {Record<string, any>} */ ({
          questionPrev: 'shift+tab',
          questionNext: 'tab',
          answer: display.target?.claudeCheckboxList ? 'tab' : 'enter',
        })[a] || a,
      );
    else await bridge.stage(a);
  }
  /** @param {any} ctx
   * @param {any} display */
  async function press(ctx, display) {
    const k = keys.get(ctx);
    if (!k) return;
    display = display || k.presented || capture(k);
    const a = display.action;
    if (
      ['none', 'status', 'inputInfo', 'claudeInfo', 'claudeModeInfo'].includes(
        a,
      )
    )
      return;
    let completed = false;
    actionBusy = true;
    activePress = { ctx, display };
    try {
      let result;
      if (
        display.scope !== scope ||
        display.appearance !== k.appearance ||
        display.visibility !== visibility ||
        display.generation !== /** @type {any} */ (bridge).generation
      )
        throw Error('Profile changed; press again');
      if (display.backendKey !== /** @type {any} */ (bridge).backendKey)
        throw Error('Controller changed; press again');
      if (display.setupBusy) throw Error('Setup finished; press again');
      if (C.needsContext(a)) {
        if (
          display.page !== page ||
          display.stamp !== C.stamp(selected(), page)
        )
          throw Error('Controls changed; press again');
        if ((display.pressedAt ?? Date.now()) < display.armedAt)
          throw Error('Controls updating; press again');
        if (!display.target) throw Error('Select an agent first');
        result = await bridge.withContext(display, () => perform(a, display));
      } else result = await perform(a, display);
      completed = true;
      k.feedback = null;
      if (result)
        k.notice = {
          until: Date.now() + 2500,
          label: result.label,
          action: a,
          stamp: display.stamp,
        };
    } catch (error) {
      k.notice = null;
      k.feedback = {
        until: Date.now() + 10000,
        message: clean(/** @type {Error & {code?: string}} */ (error).message),
        action: a,
        stamp: display.stamp,
      };
      inspectorMessage = String(
        /** @type {Error & {code?: string}} */ (error).message,
      )
        .replace(/[\x00-\x1f\x7f]/g, '')
        .slice(0, 160);
      render();
      emit('showAlert', ctx, {});
    } finally {
      actionBusy = false;
      activePress = null;
    }
    // Up/Down changes only the terminal highlight. The next key still runs its
    // full preflight against the current native dialog; no post-key pane scan
    // should hold that next key in the queue. Pickers can change their body too.
    if (
      completed &&
      display.target?.app === 'claude-code' &&
      !display.target.claudePicker &&
      ['up', 'down', 'approvalUp', 'approvalDown'].includes(a)
    ) {
      render();
      return;
    }
    // Other waiting actions must not wait for unrelated agents' discovery.
    // Refresh the acted-on Claude pane before releasing the next queued press;
    // its normal preflight still reads the actual current dialog again.
    const waitingAction = [
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
      const source = bridge;
      try {
        const live = await source.agent(display.target);
        if (source === bridge) {
          const index = /** @type {any[]} */ (source.agents).findIndex((item) =>
            sameTarget(item, display.target),
          );
          if (index >= 0) {
            if (live && sameTarget(live, display.target))
              /** @type {any[]} */ (source.agents)[index] = live;
            else /** @type {any[]} */ (source.agents).splice(index, 1);
          }
        }
      } catch {
        void refresh();
      }
      render();
    } else await refresh(true);
    render();
  }
  async function initialize() {
    if (!keys.size) return;
    await refresh();
    if (
      !startupSelectionRead &&
      (config.backend === 'herdr' || config.allowClipboardFocus)
    ) {
      startupSelectionRead = true;
      try {
        await bridge.focused();
      } catch {}
    }
    render();
  }
  /** @param {any} context
   * @param {string} [message] */
  function inspectorStatus(context, message) {
    if (message !== undefined) inspectorMessage = message;
    const a = selected(),
      agents = bridge.agents || [];
    emit('sendToPropertyInspector', context, {
      kind: 'status',
      profileScope: scope,
      profileName: scope === 'herdr' ? 'Herdr Agents' : 'Rex Agents',
      backend: config.backend || 'rex',
      preferences: preferences.view(config),
      offline,
      agents: agents.length,
      codex: agents.filter((a) => a.app === 'codex').length,
      claude: agents.filter((a) => a.app === 'claude-code').length,
      claudeIdentified: agents.filter(
        (a) => a.app === 'claude-code' && a.nativeVerified,
      ).length,
      metadata: agents.filter((a) => a.app === 'codex' && a.chatId).length,
      selected: a
        ? {
            app: a.app,
            state: a.state,
            mode: a.app === 'claude-code' ? null : a.collaborationMode || null,
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
  /** @param {any} e */
  async function inspectorRequest(e) {
    if (!keys.has(e.context)) return;
    if (e.payload?.kind === 'preferences') {
      try {
        saved = preferences.update(saved, scope, e.payload.preferences);
        persist();
        applyAllSettings();
        inspectorStatus(e.context, 'Preferences saved');
      } catch (error) {
        inspectorStatus(
          e.context,
          /** @type {Error & {code?: string}} */ (error).message,
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
    const a = selected();
    setupBusy = true;
    activePress = { ctx: e.context, display: capture(keys.get(e.context)) };
    inspectorStatus(e.context, 'Configuring the selected agent in Rex…');
    try {
      if (config.backend === 'herdr')
        throw Error(
          'Run /title thread-id in Codex and enable title matching in preferences',
        );
      if (!config.allowClipboardFocus)
        throw Error('Enable visible-pane checks first');
      if (a?.app !== 'codex' || !['idle', 'done'].includes(a.state))
        throw Error('Select a ready Codex agent on the deck');
      const display = { target: C.snapshot(a), verifyChat: false };
      await bridge.withContext(display, () =>
        require('../agents/codex/setup-daemon').configure(bridge, a, pluginDirectory),
      );
      await refresh(true);
      inspectorStatus(e.context, 'Status line configured; no prompt submitted');
    } catch (error) {
      inspectorStatus(
        e.context,
        String(/** @type {Error & {code?: string}} */ (error).message)
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
    const hadConsent = config.allowClipboardFocus;
    loadConfig();
    if (scope === 'rex' && hadConsent && !config.allowClipboardFocus) {
      bridge.lastTarget = null;
      bridge.draft = null;
      bridge.picker = null;
    } else if (
      keys.size &&
      !startupSelectionRead &&
      (scope === 'herdr' || config.allowClipboardFocus)
    )
      queue = queue.then(initialize).catch(() => {});
    render();
  }
  /** @param {any} context */
  function detach(context) {
    keys.delete(context);
    if (!keys.size) {
      visibility++;
      bridge.draft = null;
      bridge.picker = null;
      if (bridge.claude) bridge.claude.picker = null;
      completion.update(bridge.agents || [], null, Date.now());
    }
  }
  /** @param {any} context
   * @param {any} payload */
  function attach(context, payload) {
    const first = !keys.size;
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
    setBank: /** @param {any} value */ (value) => (bank = value),
  };
}
ws.on('open', () => {
  ws.send(
    JSON.stringify({ event: arg('-registerEvent'), uuid: arg('-pluginUUID') }),
  );
  ws.send(
    JSON.stringify({ event: 'getGlobalSettings', context: arg('-pluginUUID') }),
  );
  for (const runtime of controllers.values())
    if (runtime.keys.size)
      queue = queue.then(runtime.initialize).catch(() => {});
});
ws.on(
  'message',
  /** @param {any} raw */ (raw) => {
    try {
      const e = JSON.parse(raw);
      if (e.event === 'didReceiveGlobalSettings') {
        try {
          const input = e.payload?.settings || {};
          if (input.version !== 2 && loadedV2) return;
          const incoming = preferences.store(input);
          if (input.version === 2 && incoming.revision < saved.revision) return;
          saved = incoming;
          storeError = '';
          if (input.version === 2) loadedV2 = true;
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
        const scope = preferences.scopeOf(e.payload?.settings),
          prior = owners.get(e.context);
        if (prior && prior !== scope) getController(prior).detach(e.context);
        if (!scope) {
          owners.delete(e.context);
          emit('setImage', e.context, {
            image:
              'data:image/svg+xml;base64,' +
              Buffer.from(
                svg({
                  icon: 'blank',
                  lines: ['Profile', 'setup error'],
                  color: '#893748',
                }),
              ).toString('base64'),
            target: 0,
          });
          emit('setTitle', e.context, { title: '', target: 0 });
          return;
        }
        const runtime = getController(scope);
        owners.set(e.context, scope);
        if (e.event === 'didReceiveSettings' && prior === scope) {
          const k = runtime.keys.get(e.context);
          if (k) k.settings = e.payload.settings || {};
          runtime.render();
        } else runtime.attach(e.context, e.payload);
        return;
      }
      const scope = owners.get(e.context);
      if (!scope) return;
      const runtime = getController(scope);
      if (e.event === 'willDisappear') {
        runtime.detach(e.context);
        owners.delete(e.context);
        return;
      }
      if (e.event === 'sendToPlugin') {
        const appearance = runtime.keys.get(e.context)?.appearance;
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
      if (e.event === 'keyDown') {
        const k = runtime.keys.get(e.context),
          shown = k?.presented,
          display = shown
            ? { ...shown, pressedAt: Date.now(), setupBusy: runtime.setupBusy }
            : undefined;
        queue = queue
          .then(() =>
            owners.get(e.context) === scope
              ? runtime.press(e.context, display)
              : undefined,
          )
          .catch(() => {});
      }
    } catch {}
  },
);
ws.on('close', () => process.exit(0));
ws.on('error', () => process.exit(1));
setInterval(() => {
  for (const runtime of controllers.values())
    if (runtime.keys.size) void runtime.refresh();
}, 2000);
setInterval(() => {
  for (const runtime of controllers.values())
    if (runtime.keys.size) runtime.render();
}, 250);
