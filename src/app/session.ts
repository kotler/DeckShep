type RexTransport = import('../terminals/rex/transport').RexTransport;
type AgentSnapshot = import('../domain/types').AgentSnapshot;
type Config = import('../domain/types').Config;
type PressContext = import('../domain/types').PressContext;
('use strict');
const { state, token } = require('../domain/identity');
const {
  sameNavigationTarget,
  navigationSnapshot,
} = require('../domain/navigation');
const { isRexRead } = require('../domain/transport');
const { pluginDirectory } = require('../platform/paths.ts');
const path = require('node:path');
const P = require('../agents/codex/presets');
const { RexTransport } = require('../terminals/rex/transport.ts');
function identify(p: any) {
  const f: any = p.foreground;
  if (!f || f.user_id !== (process.getuid as () => number)()) return null;
  const n: string = path.basename(f.path || '');
  const s: any = f.script || '';
  if (n === 'codex')
    return { app: 'codex', pid: f.pid, name: f.name, cwd: f.cwd };
  if (
    n === 'claude' ||
    (/\/claude\/versions\/\d+\.\d+\.\d+$/.test(f.path || '') &&
      (/^claude(?:-|$)/.test(f.name) || f.name === n))
  )
    return { app: 'claude-code', pid: f.pid, name: f.name, cwd: f.cwd };
  if (
    ['node', 'bun'].includes(n) &&
    /\/(?:@anthropic-ai\/claude-code\/cli\.js|@openai\/codex\/bin\/codex\.js)$/.test(
      s,
    )
  )
    return {
      app: s.includes('anthropic') ? 'claude-code' : 'codex',
      pid: f.pid,
      name: f.name,
      cwd: f.cwd,
    };
  return null;
}
const focusError: (message: string) => Error & {
  code: string;
} = (message: string) =>
  Object.assign(Error(message), { code: 'SELECTION_CHANGED' });
class Bridge {
  declare config: import('../domain/types').Config;
  declare activate: any;
  declare readVisible: any;
  declare inspectClaudeKeyboard: typeof import('../agents/claude/keyboard-identity').claudeKeyboardIdentity;
  declare inspectKeyboardProcess: typeof import('../agents/codex/hook-process').inspectProcess;
  declare codexIdentity: (
    bridge: Record<string, any>,
    agent: AgentSnapshot,
  ) => Promise<string>;
  declare slots: {
    session: string;
    block: string;
  }[];
  declare draft: {
    snapshot?: any;
    target: any;
    at: number;
    action: string;
  } | null;
  declare claude: import('../agents/claude/controls').ClaudeControls;
  declare agents: any[] | undefined;
  declare navigationAgents: AgentSnapshot[] | undefined;
  declare lastNavigationTarget:
    import('../domain/types').TargetRef | null | undefined;
  declare lastClient: any;
  private readonly displayFocus =
    new (require('../terminals/rex/display-focus').RexDisplayFocus)();
  private sessionFocuses?: import('../terminals/rex/display-focus').SessionFocus[];
  resetDisplayFocus() {
    this.displayFocus.reset();
  }
  async displayedAgent() {
    if (!this.config.allowClipboardFocus)
      throw focusError('Visible checks disabled');
    const a = await this.displayFocus.read(
      this.lastClient,
      this.sessionFocuses || [],
      this.agents || [],
      this.readVisible,
    );
    if (!a) throw focusError('No selected agent');
    return a;
  }
  declare lastTarget: import('../domain/types').TargetRef | null | undefined;
  declare picker:
    | {
        target: any;
        phase: string;
        at: number;
      }
    | null
    | undefined;
  declare selectionNotice: boolean | undefined;
  declare actionContext: any;
  declare actionPreflight: any;
  declare lastModeRequest: any;
  #transport: (
    args: string[],
    input?: any,
    beforeIO?: () => void,
  ) => Promise<any>;
  #delivery: import('./delivery').DeliveryKernel | null = null;
  #fixture: boolean = false;
  attachDelivery(kernel: import('./delivery').DeliveryKernel) {
    this.#delivery = kernel;
  }
  get delivery() {
    return this.#delivery;
  }
  setTransport(transport: any, fixture: boolean | undefined = false) {
    this.#transport = transport;
    this.#fixture = fixture;
  }
  assertDeliveryVisible() {
    this.#delivery?.assertVisible();
  }
  requireGuardedMutation() {
    if (!this.#delivery && !this.#fixture)
      throw Error('No guarded press; no input sent');
  }
  run(args: string[], input?: any, target?: any) {
    if (this.#delivery)
      return this.#delivery.run(
        args,
        input,
        (beforeIO: () => void) => this.#transport(args, input, beforeIO),
        target,
      );
    if (!this.#fixture && !isRexRead(args)) this.requireGuardedMutation();
    return this.#transport(args, input);
  }
  deliverMutation(
    target: any,
    method: string,
    operation: (beforeIO: () => void) => Promise<any>,
  ) {
    if (this.#delivery)
      return this.#delivery.mutation(target, method, operation);
    this.requireGuardedMutation();
    return operation(() => {});
  }
  constructor(
    config: import('../domain/types').Config,
    run?: any,
    activate?: any,
    readVisible?: any,
    codexIdentity?: (
      bridge: Record<string, any>,
      agent: AgentSnapshot,
    ) => Promise<string>,
  ) {
    this.config = config;
    this.inspectKeyboardProcess = run
      ? async () => {
          throw Error('Fixture process unavailable');
        }
      : require('../agents/codex/hook-process').inspectProcess;
    this.inspectClaudeKeyboard = run
      ? async () => {
          throw Error('Fixture process unavailable');
        }
      : require('../agents/claude/keyboard-identity').claudeKeyboardIdentity;
    this.codexIdentity =
      codexIdentity || require('../agents/codex/hook-identity').readIdentity;
    const native: RexTransport = new RexTransport(() => this.config);
    this.#transport = run
      ? (args, input, beforeIO) => {
          beforeIO?.();
          return run(args, input);
        }
      : (args: string[], input: any, beforeIO?: () => void) =>
          native.command(args, input, beforeIO);
    this.run = this.run.bind(this);
    this.#fixture = typeof run === 'function';
    const activation = activate
      ? (beforeIO: () => void) => {
          beforeIO();
          return activate();
        }
      : (beforeIO: () => void) => native.activate(beforeIO);
    this.activate = () => {
      if (this.#delivery) {
        const target = this.lastTarget || this.actionContext?.target;
        if (!target) throw Error('Input target changed');
        return this.#delivery.activation(target, activation);
      }
      this.requireGuardedMutation();
      return activation(() => {});
    };
    this.readVisible = readVisible || ((client: any) => native.visible(client));
    this.slots = [];
    this.draft = null;
    this.claude = new (require('../agents/claude/controls').ClaudeControls)(
      this,
    );
  }
  async client() {
    const { clients = [] } = await this.run(['client', 'ls', '--json']);
    const apps: any = clients.filter(
      (c: any) =>
        c.info?.kind === 'app' &&
        c.info?.platform === 'macos' &&
        c.info?.name === 'Rex Beta' &&
        c.connection_state === 'connected' &&
        (!this.config.clientLabel || c.info.label === this.config.clientLabel),
    );
    if (apps.length !== 1) throw new Error('Rex app ambiguous or offline');
    return apps[0];
  }
  method(t: any, m: any) {
    return this.run(['block', 'call', '-s', t.session, '-b', t.block, m]);
  }
  async agent(t: any, terminalOnly = false, allowMissingForeground = false) {
    let p: any = await this.method(t, 'process');
    if (!p || !Object.hasOwn(p, 'foreground')) {
      // A listed pane may have no process report yet. Display refresh can
      // omit it; targeted operations and slot removal need complete proof.
      if (
        allowMissingForeground &&
        p &&
        typeof p === 'object' &&
        !Array.isArray(p)
      )
        return null;
      throw Error('Incomplete terminal process metadata');
    }
    const processIdentity = require('../platform/rex-process');
    if (processIdentity.candidate(p.foreground)) {
      const before: any = p.foreground;
      let file: any;
      try {
        file = await (
          ((this as any).resolveExecutable || processIdentity.executable) as any
        )(before.pid);
      } catch {
        return null;
      }
      const current: any = await this.method(t, 'process');
      if (!processIdentity.sameForeground(before, current?.foreground))
        return null;
      p = { ...current, foreground: { ...current.foreground, path: file } };
    }
    const a: {
      app: string;
      pid: any;
      name: any;
      cwd: any;
    } | null = identify(p);
    if (!a) return null;
    let status: {
      state: string;
    } = { state: 'unknown' };
    try {
      status = state(
        (await this.method(t, 'program_status')).records || [],
        a,
        Date.now(),
        this.config.statusMaxAgeMs,
      );
    } catch {}
    const agent: any = {
      ...t,
      ...a,
      ...status,
      project: path.basename(a.cwd || '') || a.app,
    };
    return !terminalOnly && a.app === 'claude-code'
      ? this.claude.enrich(agent)
      : agent;
  }
  async discover({ allowMissingForeground = false } = {}) {
    const client: any = await this.client(),
      listing: any = await this.run(['ls', '--json']);
    const agents: any[] = [],
      focuses: import('../terminals/rex/display-focus').SessionFocus[] = [];
    if (!Array.isArray(listing?.sessions))
      throw Error('Incomplete Rex session list');
    for (const s of listing.sessions) {
      if (typeof s.session_id !== 'string')
        throw Error('Incomplete Rex session identity');
      const ins: any = await this.run([
        'session',
        'inspect',
        s.session_id,
        '--json',
      ]);
      if (!Array.isArray(ins?.windows))
        throw Error('Incomplete Rex window list');
      focuses.push(
        require('../terminals/rex/display-focus').sessionFocus(
          s.session_id,
          ins,
        ),
      );
      for (const w of ins.windows) {
        if (typeof w.window_id !== 'string' || !Array.isArray(w.layers))
          throw Error('Incomplete Rex window');
        for (const l of w.layers) {
          if (!Array.isArray(l.blocks)) throw Error('Incomplete Rex layer');
          for (const b of l.blocks) {
            if (b.creator_name !== 'com.superlogical.terminal') continue;
            if (typeof b.block_id !== 'string')
              throw Error('Incomplete Rex pane identity');
            const t: {
              session: any;
              sessionLabel: any;
              window: any;
              block: any;
            } = {
              session: s.session_id,
              sessionLabel: s.label,
              window: w.window_id,
              block: b.block_id,
            };
            const a: any = await this.agent(t, true, allowMissingForeground);
            if (a) {
              try {
                const title = await this.method(t, 'title');
                if (typeof title?.title === 'string')
                  a.terminalTitle = title.title;
              } catch {
                /* A missing display-only title cannot hide a live pane. */
              }
              a.rexSettings = {};
              agents.push(a);
            }
          }
        }
      }
    }
    for (const a of agents)
      if (
        !this.slots.some(
          (s: { session: string; block: string }) =>
            s.block === a.block && s.session === a.session,
        )
      )
        this.slots.push({ session: a.session, block: a.block });
    this.agents = agents;
    this.navigationAgents = agents.map(navigationSnapshot);
    this.lastClient = client;
    this.sessionFocuses = focuses;
    if (
      this.lastTarget?.app === 'claude-code' &&
      !agents.some((a: any) => sameNavigationTarget(a, this.lastTarget))
    ) {
      this.lastTarget = null;
      this.draft = null;
      this.picker = null;
      this.selectionNotice = true;
    }
    return agents;
  }
  slotGaps() {
    return this.slots.filter(
      (s: { session: string; block: string }) =>
        !this.agents?.some(
          (a: any) => a.session === s.session && a.block === s.block,
        ),
    ).length;
  }
  async collapse() {
    await this.discover();
    const removed: number = this.slotGaps();
    this.slots = this.slots.filter((s: { session: string; block: string }) =>
      (this.agents as any[]).some(
        (a: any) => a.session === s.session && a.block === s.block,
      ),
    );
    return {
      removed,
      label: removed
        ? `${removed} gap${removed === 1 ? '' : 's'} removed`
        : 'No gaps',
    };
  }
  async focused(terminalOnly = false, observeOnly = false) {
    this.assertDeliveryVisible();
    if (!this.config.allowClipboardFocus)
      throw new Error('Clipboard focus query not authorized; input disabled');
    const c: any = await this.client();
    const block: any = await this.readVisible(c.client_id);
    this.displayFocus.observed(c.client_id, block);
    const { sessions = [] } = await this.run(['ls', '--json']);
    const matches: any[] = [];
    for (const session of sessions) {
      const ins: any = await this.run([
        'session',
        'inspect',
        session.session_id,
        '--json',
      ]);
      for (const w of ins.windows || [])
        for (const l of w.layers || [])
          for (const b of l.blocks || [])
            if (
              b.block_id === block &&
              b.creator_name === 'com.superlogical.terminal'
            )
              matches.push({
                session: session.session_id,
                window: w.window_id,
                block,
              });
    }
    if (matches.length !== 1)
      throw focusError('Visible pane is closed or ambiguous');
    const a: any = await this.agent(matches[0], terminalOnly);
    if (!a) throw focusError('Visible pane is not a supported agent');
    if (this.actionContext) {
      require('../guards/context').assertContext(this.actionContext, a);
      if (this.actionContext.verifyChat) {
        if (!this.actionContext.target.chatId)
          throw Error('Chat metadata loading; try again');
        if (a.app === 'claude-code')
          this.claude.assert(this.actionContext.target, a);
        else if (
          (await this.codexIdentity(this, a)) !==
          this.actionContext.target.chatId
        )
          throw Error('Selected chat changed');
      }
    }
    if (observeOnly) return a;
    this.lastTarget = {
      session: a.session,
      block: a.block,
      pid: a.pid,
      app: a.app,
      name: a.name,
      ...(a.app === 'claude-code'
        ? {
            app: a.app,
            name: a.name,
            chatId: a.chatId,
            nativeIdentity: a.nativeIdentity,
          }
        : {}),
    } as import('../domain/types').TargetRef;
    if (terminalOnly) this.lastNavigationTarget = navigationSnapshot(a);
    this.assertDeliveryVisible();
    return a;
  }
  async contextPreflight() {
    return this.focused();
  }
  async withContext(context: any, action: () => any) {
    if (this.actionContext) throw Error('Another action is in progress');
    this.actionContext = context;
    try {
      this.actionPreflight = await (
        this.contextPreflight as (...args: any[]) => Promise<any>
      )(context);
      return await action();
    } catch (error: unknown) {
      if (
        (
          error as Error & {
            code?: string;
          }
        ).code === 'SELECTION_CHANGED'
      ) {
        this.lastTarget = null;
        this.draft = null;
        this.picker = null;
        this.selectionNotice = true;
      }
      throw error;
    } finally {
      this.actionContext = null;
      this.actionPreflight = null;
    }
  }
  async providerAgent() {
    if (this.actionPreflight?.app === 'claude-code') {
      const agent: any = this.actionPreflight;
      this.actionPreflight = null;
      return agent;
    }
    return this.focused();
  }
  async checked(t: any, ready: any = false) {
    const a: any = await this.focused();
    if (token(a) !== token(t)) throw focusError('Focus or process changed');
    if (ready && !['idle', 'done', 'error'].includes(a.state))
      throw new Error('Agent not ready for a prompt');
    return a;
  }
  async focus(t: any) {
    const c: any = await this.client();
    const a: any = await this.agent(t, true);
    if (!a) throw new Error('Agent closed');
    if (
      t.pid !== undefined &&
      (t.pid !== a.pid ||
        (t.app && t.app !== a.app) ||
        (t.name && t.name !== a.name))
    )
      throw Error('Agent process changed');
    await this.run(
      [
        '-C',
        c.client_id,
        'do',
        'session.select',
        `session_id=${t.session}`,
        `window_id=${t.window}`,
      ],
      undefined,
      a,
    );
    await this.run(['focus', '-s', t.session, t.block], undefined, a);
    this.draft = null;
    this.picker = null;
    this.selectionNotice = false;
    this.lastTarget = {
      session: a.session,
      block: a.block,
      pid: a.pid,
      app: a.app,
      name: a.name,
      ...(a.app === 'claude-code'
        ? {
            app: a.app,
            name: a.name,
            chatId: a.chatId,
            nativeIdentity: a.nativeIdentity,
          }
        : {}),
    } as import('../domain/types').TargetRef;
    this.resetDisplayFocus();
    // Rex acknowledged a focus request. Only a visible-pane read may move the dot.
    if (this.config.bringToFront !== false) await this.activate();
  }
  readKeyboardText(target: AgentSnapshot): Promise<string> {
    return new (require('../agents/codex/setup-presets').Setup)(this).screen(
      target,
    );
  }
  readKeyboardView(
    target: AgentSnapshot,
    frameIdentity?: (vt: string, text: string) => string,
  ) {
    return require('../terminals/rex/viewport').stableViewport(
      target,
      this.run,
      () => this.readKeyboardText(target),
      frameIdentity,
    );
  }
  async readPane(target: import('../domain/types').TargetRef) {
    const agent = await this.agent(target);
    if (!agent || token(agent) !== token(target) || agent.pid !== target.pid)
      throw Error('Agent process changed');
    return {
      text: await new (require('../agents/codex/setup-presets').Setup)(
        this,
      ).screen(agent),
    };
  }
  async navigate(delta: number) {
    await this.discover();
    const a: any = await this.focused(true);
    const i: number = (this.agents as any[]).findIndex(
      (x: any) => token(x) === token(a),
    );
    if (i < 0 || !(this.agents as any[]).length) throw new Error('No agents');
    await this.focus(
      (this.agents as any[])[
        (i + delta + (this.agents as any[]).length) %
          (this.agents as any[]).length
      ],
    );
  }
  async stage(action: string) {
    const a: any = await this.focused();
    if (a.app === 'claude-code') return this.claude.stage(action);
    await this.checked(a, true);
    if (this.picker) throw new Error('Close the model picker first');
    if (this.draft)
      throw new Error('Draft already staged; review or cancel first');
    const text: string =
      action === 'model'
        ? '/model'
        : action === 'effort'
          ? a.app === 'codex'
            ? '/model'
            : '/effort'
          : this.config.prompts[action];
    if (
      typeof text !== 'string' ||
      !text ||
      /[\x00-\x1f\x7f]/.test(text) ||
      text.length > 4000
    )
      throw new Error('Invalid single-line prompt');
    const control: boolean = ['model', 'effort'].includes(action),
      read: any =
        (this as any).readStagedComposer ||
        require('../agents/codex/native-input').readIdleComposer;
    if (!control && /^\s*[!\/]/.test(text))
      throw Error('Prompt shortcuts require plain text');
    if (!control && (a.app !== 'codex' || !this.config.controlVerified?.codex))
      throw Error('Prompt controls verified for Codex only');
    const before: any = control
      ? null
      : await read(this, a, { allowEmpty: true });
    const modes: any = await this.method(a, 'modes');
    if (!modes.modes?.some((m: any) => m.number === 2004 && m.set))
      throw new Error('Bracketed paste unavailable');
    await this.checked(a, true);
    await this.run(
      ['send', '-s', a.session, '-b', a.block],
      `\x1b[200~${text}\x1b[201~`,
    );
    let snapshot: any;
    if (!control) {
      const deadline: number = Date.now() + 1800;
      for (let attempt: number = 0; attempt < 5; attempt++) {
        snapshot = await read(this, a, { allowEmpty: true });
        if (
          snapshot.chatId !== before.chatId ||
          snapshot.turnStamp !== before.turnStamp
        )
          throw Error('Chat changed; review text in Rex');
        if (!snapshot.empty && snapshot.hash !== before.hash) break;
        snapshot = null;
        if (Date.now() >= deadline) break;
        await new Promise((resolve: (value: any) => void) =>
          setTimeout(resolve, 60),
        );
      }
      if (!snapshot) throw Error('Paste not confirmed; review text in Rex');
      await this.checked(a, true);
    }
    this.draft = {
      target: a,
      at: Date.now(),
      action,
      ...(snapshot ? { snapshot } : {}),
    };
    return a;
  }
  async send() {
    if (this.draft?.target.app === 'claude-code') return this.claude.send();
    if (this.picker) return this.applyPicker();
    const d: {
      snapshot?: any;
      target: any;
      at: number;
      action: string;
    } | null = this.draft;
    if (!d || Date.now() - d.at > this.config.draftMaxAgeMs) {
      this.draft = null;
      throw new Error('No recent staged draft');
    }
    await this.checked(d.target, true);
    const control: boolean = ['model', 'effort'].includes(d.action);
    const key: string = control ? 'enter' : this.config.sendKeys[d.target.app];
    if (!['tab', 'enter'].includes(key))
      throw new Error('Send binding unavailable');
    if (!control) {
      try {
        if (!d.snapshot) throw Error('Draft not verified; use Rex');
        const {
            sameComposer,
            readIdleComposer,
          } = require('../agents/codex/native-input'),
          read: any = (this as any).readStagedComposer || readIdleComposer;
        const before: any = await read(this, d.target);
        await this.checked(d.target, true);
        const after: any = await read(this, d.target);
        if (
          before.empty ||
          after.empty ||
          !sameComposer(d.snapshot, before) ||
          !sameComposer(before, after)
        )
          throw Error('Draft changed; review in Rex');
        await this.checked(d.target, true);
      } catch (error: unknown) {
        this.draft = null;
        throw error;
      }
    }
    this.draft = null;
    await this.run([
      'send-key',
      '-s',
      d.target.session,
      '-b',
      d.target.block,
      key,
    ]);
    if (control)
      this.picker = {
        target: d.target,
        phase: d.target.app === 'codex' ? 'model' : d.action,
        at: Date.now(),
      };
  }
  async pickerTarget() {
    const p:
      | {
          target: any;
          phase: string;
          at: number;
        }
      | null
      | undefined = this.picker;
    if (!p || Date.now() - p.at > 60000) {
      this.picker = null;
      throw new Error('Picker expired; use the Rex keyboard');
    }
    try {
      await this.checked(p.target, true);
    } catch (e: unknown) {
      this.picker = null;
      throw e;
    }
    p.at = Date.now();
    return p;
  }
  async pickerKey(p: any, key: string) {
    await this.run([
      'send-key',
      '-s',
      p.target.session,
      '-b',
      p.target.block,
      key,
    ]);
  }
  async cyclePicker(kind: string) {
    const a: any = await this.focused();
    if (!this.config.controlVerified?.[a.app])
      throw new Error('Verify model controls on this agent first');
    if (!this.picker) {
      await this.stage(kind);
      return;
    }
    const p: {
      target: any;
      phase: string;
      at: number;
    } = await this.pickerTarget();
    if (p.target.app === 'codex') {
      if (kind === 'model' && p.phase === 'effort') {
        await this.pickerKey(p, 'escape');
        p.phase = 'model';
      }
      if (kind === 'effort' && p.phase === 'model') {
        await this.pickerKey(p, 'enter');
        p.phase = 'effort';
        return;
      }
      await this.pickerKey(p, 'down');
    } else await this.pickerKey(p, kind === 'effort' ? 'right' : 'down');
  }
  async cycleControl(kind: string) {
    if (!['model', 'effort', 'permissions'].includes(kind))
      throw new Error('Unsupported cycle');
    const a: any = await this.providerAgent();
    if (a.app === 'claude-code') {
      if (kind === 'permissions')
        throw Error('Use Claude keyboard for permission modes');
      return this.claude.cycle(kind, a);
    }
    if (a.app !== 'codex' || !this.config.controlVerified?.codex)
      throw new Error('Cycle controls not verified for this agent');
    if (this.picker) throw new Error('Close the native picker first');
    if (kind === 'effort') {
      if (!this.config.daemonControls?.enabled)
        throw Error('Effort daemon unavailable');
      return new (require('../agents/codex/daemon').DaemonControls)(
        this,
      ).cycleEffort(a);
    }
    if (kind === 'model' && this.config.daemonControls?.enabled)
      return new (require('../agents/codex/daemon').DaemonControls)(this).cycle(
        a,
      );
    if (
      kind === 'permissions' &&
      this.config.daemonControls?.enabled &&
      this.config.daemonControls.permissionsEnabled
    )
      return new (require('../agents/codex/daemon').DaemonControls)(
        this,
      ).cyclePermissions(a);
    await this.checked(a, true);
    const file: string = path.join(
      pluginDirectory,
      'state',
      'native-presets.json',
    );
    if (kind !== 'permissions' && this.config.modelDiscovery?.enabled)
      return new (require('../agents/codex/models').ModelControls)(this).cycle(
        kind,
        a,
        file,
      );
    let registry: any = P.readRegistry(file),
      record: any = registry.agents[token(a)];
    if (!record && this.config.cycles?.autoSetupNewSessions) {
      await new (require('../agents/codex/setup-presets').Setup)(
        this,
      ).configure(a, this.config.cycles, file);
      registry = P.readRegistry(file);
      record = registry.agents[token(a)];
    }
    if (!record || record.signature !== P.signature(this.config.cycles))
      throw new Error('Native presets need setup in this session');
    const entries: any = record.entries.filter((e: any) => e.kind === kind);
    if (!entries.length) throw new Error('No cycle entries');
    P.validateOnDisk(entries);
    const i: number = (record.indices[kind] || 0) % entries.length,
      entry: any = entries[i];
    await this.checked(a, true);
    await this.run([
      'send-key',
      '-s',
      a.session,
      '-b',
      a.block,
      'ctrl+x',
      'p',
      entry.slot,
    ]);
    record.indices[kind] = (i + 1) % entries.length;
    P.saveRegistry(file, registry);
    return { kind, label: entry.label };
  }
  async adjustEffort(direction: string) {
    if (!['increase', 'decrease'].includes(direction))
      throw new Error('Unsupported effort direction');
    const a: any = await this.focused();
    if (a.app !== 'codex' || !this.config.controlVerified?.codex)
      throw new Error('Effort shortcuts not verified for this agent');
    if (this.picker) throw new Error('Close the native picker first');
    const key: any = (this.config.effortKeys as Record<string, any>)?.[
      direction
    ];
    if (!['shift+up', 'shift+down', 'alt+.', 'alt+,'].includes(key))
      throw new Error('Effort shortcut unavailable');
    await this.checked(a, true);
    await this.run(['send-key', '-s', a.session, '-b', a.block, key]);
    return {
      kind: 'effort',
      label: direction === 'increase' ? 'Increase sent' : 'Decrease sent',
    };
  }
  async togglePlan() {
    const a: any = await this.focused();
    await this.checked(a, true);
    if (a.app !== 'codex' || !this.config.controlVerified?.codex)
      throw new Error('Plan toggle not verified for this agent');
    if (this.picker) throw new Error('Close the native picker first');
    this.lastModeRequest = { ...a, at: Date.now() };
    await this.run(['send-key', '-s', a.session, '-b', a.block, 'shift+tab']);
    return { kind: 'plan', label: 'Toggle sent' };
  }
  async applyPicker() {
    const p: {
      target: any;
      phase: string;
      at: number;
    } = await this.pickerTarget();
    if (p.target.app === 'codex' && p.phase === 'model') {
      await this.pickerKey(p, 'enter');
      p.phase = 'effort';
      return;
    }
    this.picker = null;
    await this.pickerKey(p, 's');
  }
  async cancelPicker() {
    const p: {
      target: any;
      phase: string;
      at: number;
    } = await this.pickerTarget();
    await this.pickerKey(p, 'escape');
    if (p.target.app === 'codex' && p.phase === 'effort') p.phase = 'model';
    else this.picker = null;
  }
  async interrupt() {
    const a: any = await this.focused();
    if (a.app === 'claude-code') return this.claude.interrupt();
    if (a.state !== 'working') throw new Error('Interrupt only while working');
    if (a.app === 'codex')
      await ((
        (this as any).verifyRunning
          ? (this as any).verifyRunning(a)
          : new (require('../agents/codex/background').BackgroundControls)(
              this,
            ).running(a)
      ) as any);
    const current: any = await this.checked(a);
    if (current.state !== 'working')
      throw Error('Run ended; no interrupt sent');
    this.draft = null;
    await this.run(['send-key', '-s', a.session, '-b', a.block, 'escape']);
  }
  async stopTerminals() {
    const a: any = await this.focused(),
      target: any = this.actionContext?.target;
    if (!target || !require('../guards/context').isBackground(target))
      throw Error('Select the background-terminal control');
    await this.checked(a);
    return new (require('../agents/codex/background').BackgroundControls)(
      this,
    ).stop(target);
  }
  async menu(key: string) {
    if (!['up', 'down', 'left', 'right', 'escape'].includes(key))
      throw new Error('Unsupported menu key');
    const a: any = await this.focused();
    if (a.state !== 'blocked') throw new Error('No native waiting menu');
    await this.checked(a);
    this.draft = null;
    await this.run(['send-key', '-s', a.session, '-b', a.block, key]);
  }
  async questionKey(key: string) {
    if (
      ![
        'up',
        'down',
        'left',
        'right',
        'escape',
        'tab',
        'shift+tab',
        'enter',
        'space',
      ].includes(key)
    )
      throw Error('Unsupported question key');
    const waiting: (a: any) => boolean = (a: any) =>
      a.app === 'codex' &&
      this.config.controlVerified?.codex &&
      a.state === 'blocked' &&
      a.kind === 'question';
    const agent: any = await this.providerAgent();
    if (agent.app === 'claude-code')
      return this.claude.waiting(key, 'question', agent);
    if (key === 'space') throw Error('Space is a Claude multi-select control');
    if (!waiting(agent)) throw Error('No native question waiting');
    const current: any = await this.checked(agent);
    if (!waiting(current)) throw Error('Question changed; no input sent');
    await this.run([
      'send-key',
      '-s',
      current.session,
      '-b',
      current.block,
      key,
    ]);
  }
  async approvalKey(key: string) {
    if (!['up', 'down', 'enter', 'escape'].includes(key))
      throw Error('Unsupported approval key');
    const waiting: (a: any) => boolean = (a: any) =>
      a.app === 'codex' &&
      this.config.controlVerified?.codex &&
      a.state === 'blocked' &&
      a.kind === 'permission';
    const agent: any = await this.providerAgent();
    if (agent.app === 'claude-code')
      return this.claude.waiting(key, 'permission', agent);
    if (!waiting(agent)) throw Error('No native approval waiting');
    const read: any =
      (this as any).readRequest ||
      require('../agents/codex/native-input').requestSnapshot;
    const before: any = await read(this, agent),
      current: any = await this.checked(agent);
    if (
      !waiting(current) ||
      agent.statusAt !== current.statusAt ||
      !agent.statusAt
    )
      throw Error('Approval request changed');
    if ((await read(this, current)) !== before)
      throw Error('Approval view changed; press again');
    await this.run([
      'send-key',
      '-s',
      current.session,
      '-b',
      current.block,
      key,
    ]);
  }
  async submitRunning(kind: string) {
    if (!['steer', 'queue'].includes(kind))
      throw Error('Unsupported running action');
    const running: (a: any) => boolean = (a: any) =>
      a.app === 'codex' &&
      this.config.controlVerified?.codex &&
      a.state === 'working';
    const agent: any = await this.focused();
    if (agent.app === 'claude-code') return this.claude.running(kind);
    if (!running(agent)) throw Error('Agent is not running');
    const read: any =
        (this as any).readComposer ||
        require('../agents/codex/native-input').readComposer,
      before: any = await read(this, agent),
      current: any = await this.checked(agent);
    if (!running(current)) throw Error('Run ended; no input sent');
    const after: any = await read(this, current);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error('Typed message changed; press again');
    const identity: string =
      token(current) + '|' + before.chatId + '|' + before.hash;
    if (
      (this as any).submittedInput?.identity === identity &&
      Date.now() - (this as any).submittedInput.at < 10000
    )
      throw Error('Already submitted; check Codex');
    (this as any).submittedInput = { identity, at: Date.now() };
    this.draft = null;
    await this.run([
      'send-key',
      '-s',
      current.session,
      '-b',
      current.block,
      kind === 'steer' ? 'enter' : 'tab',
    ]);
    return { kind, label: kind === 'steer' ? 'Steer sent' : 'Message queued' };
  }
  async zoom() {
    const a: any = await this.focused();
    await this.checked(a);
    await this.run(['zoom', '-s', a.session, a.block]);
  }
}
module.exports = { Bridge, identify, state, token };

export { Bridge };
