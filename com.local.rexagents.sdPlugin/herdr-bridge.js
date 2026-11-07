'use strict';
const path = require('node:path'),
  crypto = require('node:crypto'),
  { execFile } = require('node:child_process');
const { Bridge } = require('./core'),
  C = require('./context-controls'),
  { TitleIdentity } = require('./herdr-title-identity'),
  { HerdrRpc, paneId } = require('./herdr-rpc');
const changed = () =>
  Object.assign(Error('Reselect agent on deck'), { code: 'SELECTION_CHANGED' });
const isFocused = (s, a) =>
  a?.serverFocused === true &&
  s.focused_pane_id === a.block &&
  s.focused_tab_id === a.window &&
  s.focused_workspace_id === a.workspaceId;
const target = (a) =>
  Object.fromEntries(
    [
      'session',
      'window',
      'block',
      'app',
      'pid',
      'name',
      'terminalId',
      'chatId',
      'nativeIdentity',
    ].map((k) => [k, a[k]]),
  );
function waitingDigest(view) {
  // Selection markers may move as the user navigates. Bind a press to the
  // question or command body, rather than Herdr's terminal-generation revision.
  const body = view
    .split('\n')
    .map((line) => line.replace(/^(\s*)[›>●○✓✔](?=\s+\d+[.)]\s)/, '$1 '))
    .join('\n');
  return crypto.createHash('sha256').update(body).digest('hex');
}
function ownProcess(pid) {
  return new Promise((resolve, reject) =>
    execFile(
      '/bin/ps',
      ['-p', String(pid), '-o', 'uid='],
      { timeout: 1500, maxBuffer: 256 },
      (error, out) => {
        if (error || !/^\d+$/.test(out.trim()))
          reject(Error('Herdr foreground owner unavailable'));
        else resolve(out.trim() === String(process.getuid()));
      },
    ),
  );
}
function foreground(info, processInfo) {
  if (
    processInfo?.pane_id !== info.pane_id ||
    !Array.isArray(processInfo.foreground_processes)
  )
    throw Error('Herdr foreground metadata incomplete');
  const candidates = processInfo.foreground_processes.filter((p) => {
    const name = path.basename(p.name || '');
    return info.agent === 'codex'
      ? name === 'codex'
      : info.agent === 'claude'
        ? name === 'claude' ||
          /^claude-/.test(name) ||
          /^\d+\.\d+\.\d+$/.test(name)
        : name === info.agent;
  });
  if (candidates.length > 1)
    throw Error('Herdr foreground process is ambiguous');
  if (!candidates.length) return null;
  const p = candidates[0];
  if (!Number.isSafeInteger(p.pid) || p.pid <= 0 || typeof p.name !== 'string')
    throw Error('Herdr process identity unavailable');
  const cwd = p.cwd || info.foreground_cwd;
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd))
    throw Error('Herdr foreground directory unavailable');
  return { pid: p.pid, name: p.name, cwd };
}
function validateInfo(info) {
  if (
    !info ||
    !paneId(info.pane_id) ||
    typeof info.terminal_id !== 'string' ||
    !info.terminal_id ||
    typeof info.workspace_id !== 'string' ||
    typeof info.tab_id !== 'string' ||
    typeof info.focused !== 'boolean' ||
    !Number.isSafeInteger(info.revision) ||
    (info.agent != null &&
      (typeof info.agent !== 'string' ||
        !/^[-a-z0-9_]{1,64}$/.test(info.agent))) ||
    !['idle', 'working', 'blocked', 'done', 'unknown'].includes(
      info.agent_status,
    )
  )
    throw Error('Herdr agent metadata incomplete');
  return info;
}
class HerdrBridge extends Bridge {
  constructor(config, deps = {}) {
    super(config);
    this.backend = 'herdr';
    this.composerSupported = false;
    this.titleBindings = new Map();
    this.identitySequence = 0;
    this.connect =
      deps.connect ||
      (() => new HerdrRpc(this.config.herdr?.socketPath || '').connect());
    this.owner = deps.owner || ownProcess;
    this.identity = deps.identity || new TitleIdentity();
    this.run = this.translate.bind(this);
    this.readRequest = async (_bridge, a) => this.requestHash(a);
  }
  async use(callback) {
    const rpc = await this.connect();
    try {
      return await callback(rpc);
    } finally {
      rpc.close();
    }
  }
  async snapshot(rpc) {
    const response = await rpc.request('session.snapshot', {}),
      s = response?.snapshot;
    if (
      response?.type !== 'session_snapshot' ||
      s?.protocol !== 22 ||
      !/^0\.9\.5(?:[-+].*)?$/.test(s.version || '') ||
      !['agents', 'panes', 'tabs', 'workspaces', 'layouts'].every((k) =>
        Array.isArray(s[k]),
      )
    )
      throw Error('Herdr snapshot incomplete or unsupported');
    return s;
  }
  async readAgent(rpc, pane, initial) {
    const info = validateInfo(
      initial || (await rpc.request('agent.get', { target: pane }))?.agent,
    );
    if (info.pane_id !== pane) throw changed();
    if (info.agent == null) return null;
    const [processResponse, paneResponse] = await Promise.all([
      rpc.request('pane.process_info', { pane_id: pane }),
      rpc.request('pane.get', { pane_id: pane }),
    ]);
    const p = foreground(info, processResponse?.process_info);
    if (!p || !(await this.owner(p.pid))) return null;
    const paneInfo = paneResponse?.pane;
    if (
      paneInfo?.pane_id !== pane ||
      paneInfo.terminal_id !== info.terminal_id ||
      paneInfo.tab_id !== info.tab_id ||
      paneInfo.workspace_id !== info.workspace_id
    )
      throw changed();
    const a = {
      backend: 'herdr',
      session: rpc.endpoint.scope,
      window: info.tab_id,
      block: pane,
      terminalId: info.terminal_id,
      workspaceId: info.workspace_id,
      ...p,
      app: info.agent === 'claude' ? 'claude-code' : info.agent,
      state: info.agent_status,
      statusAt: String(info.state_change_seq ?? 0) + ':' + info.revision,
      project: path.basename(p.cwd),
      chatName:
        (this.config.herdr?.titleIdentity
          ? info.name
          : info.title || info.terminal_title_stripped || info.name) ||
        'Untitled agent',
      composerSupported: false,
      serverFocused: info.focused === true && paneInfo.focused === true,
      atBottom: paneInfo.scroll?.offset_from_bottom === 0,
    };
    if (a.app === 'codex') {
      let status;
      if (this.config.herdr?.titleIdentity === true)
        try {
          const title = info.terminal_title_stripped,
            binding = await this.identity.resolve(a, title);
          // Recheck pane generation, title and foreground after the daemon round-trip.
          const after = validateInfo(
              (await rpc.request('agent.get', { target: pane }))?.agent,
            ),
            pp = foreground(
              after,
              (await rpc.request('pane.process_info', { pane_id: pane }))
                ?.process_info,
            );
          if (
            after.pane_id !== pane ||
            after.terminal_id !== a.terminalId ||
            after.workspace_id !== a.workspaceId ||
            after.tab_id !== a.window ||
            after.agent !== info.agent ||
            after.terminal_title_stripped !== title ||
            !pp ||
            pp.pid !== a.pid ||
            pp.cwd !== a.cwd ||
            !(await this.owner(pp.pid))
          )
            throw Error('Title or foreground changed; reselect agent');
          a.herdrChatId = a.chatId = binding.chatId;
          a.nativeIdentity = binding.nativeIdentity;
          status = binding.status;
        } catch (error) {
          a.nativeError = error.message;
        }
      else a.nativeError = 'Enable thread-ID title matching in preferences';
      a.nativeVerified = !!status;
      const bindingKey = C.actor(a) + '|' + a.cwd,
        signature = a.nativeVerified ? a.chatId + '|' + a.nativeIdentity : null,
        prior = this.titleBindings.get(bindingKey);
      if (!prior || prior.signature !== signature)
        this.titleBindings.set(bindingKey, {
          signature,
          generation: ++this.identitySequence,
        });
      if (a.nativeVerified)
        a.nativeIdentity += ':' + this.titleBindings.get(bindingKey).generation;
      if (status?.type === 'active') {
        const flags = status.activeFlags;
        if (
          !Array.isArray(flags) ||
          flags.some(
            (f) => !['waitingOnApproval', 'waitingOnUserInput'].includes(f),
          ) ||
          flags.length > 1
        ) {
          a.state = 'unknown';
        } else if (flags.length) {
          a.state = 'blocked';
          a.kind = flags[0] === 'waitingOnApproval' ? 'permission' : 'question';
        } else a.state = 'working';
      } else if (status?.type === 'systemError') a.state = 'error';
      else if (status?.type === 'idle')
        a.state = a.state === 'done' ? 'done' : 'idle';
      if (status?.runId) a.runId = status.runId;
      if (
        status?.backgroundOnly &&
        Array.isArray(status.backgroundIds) &&
        status.backgroundIds.length &&
        status.backgroundTurnId
      ) {
        a.state = 'working';
        a.backgroundOnly = true;
        a.backgroundIds = [...status.backgroundIds];
        a.backgroundTurnId = status.backgroundTurnId;
        a.activityStatusAt = a.statusAt;
      }
    }
    if (a.nativeVerified && a.state === 'blocked' && a.atBottom)
      a.statusAt += ':' + waitingDigest(await this.readView(rpc, a, 'text'));
    return a.app === 'claude-code' ? this.claude.enrich(a) : a;
  }
  async agent(t) {
    return this.use(async (rpc) => {
      if (t.session && t.session !== rpc.endpoint.scope) throw changed();
      const a = await this.readAgent(rpc, t.block);
      if (t.terminalId && a?.terminalId !== t.terminalId) throw changed();
      return a;
    });
  }
  async discover() {
    const agents = await this.use(async (rpc) => {
      const s = await this.snapshot(rpc),
        paneIds = s.panes.map((p) => p.pane_id),
        seen = new Set();
      if (new Set(paneIds).size !== paneIds.length)
        throw Error('Duplicate Herdr panes');
      const ordered = [];
      for (const w of [...s.workspaces].sort((a, b) => a.number - b.number))
        for (const tab of s.tabs
          .filter((t) => t.workspace_id === w.workspace_id)
          .sort((a, b) => a.number - b.number)) {
          const layout = s.layouts.find((l) => l.tab_id === tab.tab_id);
          if (!layout || !Array.isArray(layout.panes))
            throw Error('Herdr layout incomplete');
          for (const p of layout.panes) {
            if (seen.has(p.pane_id) || !paneIds.includes(p.pane_id))
              throw Error('Herdr topology incomplete');
            seen.add(p.pane_id);
            const info = s.agents.find((a) => a.pane_id === p.pane_id);
            if (info) {
              if (
                info.tab_id !== tab.tab_id ||
                info.workspace_id !== w.workspace_id
              )
                throw Error('Herdr agent location changed');
              const a = await this.readAgent(rpc, p.pane_id, info);
              if (a) ordered.push(a);
            }
          }
        }
      if (
        s.agents.some((a) => !seen.has(a.pane_id)) ||
        new Set(s.agents.map((a) => a.pane_id)).size !== s.agents.length
      )
        throw Error('Herdr agent list incomplete');
      return ordered;
    });
    for (const a of agents)
      if (
        !this.slots.some((s) => s.session === a.session && s.block === a.block)
      )
        this.slots.push({ session: a.session, block: a.block });
    this.agents = agents;
    this.claude.prune(agents);
    const liveBindings = new Set(agents.map((a) => C.actor(a) + '|' + a.cwd));
    for (const key of this.titleBindings.keys())
      if (!liveBindings.has(key)) this.titleBindings.delete(key);
    if (
      this.lastTarget &&
      !agents.some(
        (a) =>
          C.actor(a) === C.actor(this.lastTarget) &&
          (!this.lastTarget.chatId ||
            (a.chatId === this.lastTarget.chatId &&
              a.nativeIdentity === this.lastTarget.nativeIdentity)),
      )
    ) {
      this.lastTarget = null;
      this.selectionNotice = true;
      this.draft = null;
      this.picker = null;
    }
    return agents;
  }
  async focused() {
    return this.use(async (rpc) => {
      const s = await this.snapshot(rpc);
      if (!paneId(s.focused_pane_id)) throw changed();
      const a = await this.readAgent(rpc, s.focused_pane_id);
      if (!a || !isFocused(s, a)) throw changed();
      if (this.actionContext) {
        if (this.actionContext.action !== 'zoom')
          this.assertBinding(this.actionContext.target, a);
        if (
          a.state === 'blocked' &&
          !a.atBottom &&
          this.actionContext.action !== 'zoom'
        )
          throw Error('Scroll the Herdr pane to bottom');
        C.assertContext(this.actionContext, a);
        if (
          this.actionContext.verifyChat &&
          (!(a.app === 'claude-code' ? a.chatId : a.herdrChatId) ||
            (a.app === 'claude-code' ? a.chatId : a.herdrChatId) !==
              this.actionContext.target.chatId)
        )
          throw Error('Selected chat changed');
      }
      this.lastTarget = target(a);
      this.lastChecked = a;
      return a;
    });
  }
  async checked(t, ready = false, verifyNative = true) {
    const a = await this.focused();
    if (C.actor(a) !== C.actor(t)) throw changed();
    if (t.chatId && verifyNative) this.assertBinding(t, a);
    if (ready && !['idle', 'done', 'error'].includes(a.state))
      throw Error('Agent not ready');
    return a;
  }
  navigationContext(a, key) {
    return (
      a?.app === 'claude-code' &&
      !a.claudePicker &&
      a.state === 'blocked' &&
      this.actionContext?.target &&
      C.actor(this.actionContext.target) === C.actor(a) &&
      { up: 'up', down: 'down', approvalUp: 'up', approvalDown: 'down' }[
        this.actionContext.action
      ] === key
    );
  }
  async contextPreflight(context) {
    const a = this.agents?.find(
      (item) => C.actor(item) === C.actor(context.target),
    );
    // Arrow navigation performs its complete fresh validation immediately before
    // sending. It does not need a second full discovery/enrichment beforehand.
    if (
      a?.app === 'claude-code' &&
      !a.claudePicker &&
      a.state === 'blocked' &&
      ['up', 'down', 'approvalUp', 'approvalDown'].includes(context.action)
    ) {
      C.assertContext(context, a);
      this.assertBinding(context.target, a);
      return a;
    }
    return super.contextPreflight(context);
  }
  async focus(t) {
    return this.use(async (rpc) => {
      if (t.session !== rpc.endpoint.scope) throw changed();
      const a = await this.readAgent(rpc, t.block);
      if (!a || C.actor(a) !== C.actor(t)) throw changed();
      await rpc.request('agent.focus', { target: a.block });
      const s = await this.snapshot(rpc);
      if (s.focused_pane_id !== a.block) throw Error('Herdr focus unconfirmed');
      const confirmed = await this.readAgent(rpc, a.block);
      if (C.actor(a) !== C.actor(confirmed) || !isFocused(s, confirmed))
        throw changed();
      this.lastTarget = target(confirmed);
      this.lastChecked = confirmed;
      this.draft = null;
      this.picker = null;
      this.selectionNotice = false;
    });
  }
  assertBinding(expected, a) {
    if (a?.app === 'claude-code') return this.claude.assert(expected, a);
    if (!a?.nativeVerified || !a.chatId || !a.nativeIdentity)
      throw Error(a?.nativeError || 'Native chat identity unavailable');
    if (
      !expected?.chatId ||
      expected.chatId !== a.chatId ||
      expected.nativeIdentity !== a.nativeIdentity
    )
      throw changed();
    if (expected.runId && expected.runId !== a.runId)
      throw Error('Agent started a new turn');
  }
  async nativeChatId(t) {
    const a = await this.agent(t);
    if (!a || C.actor(a) !== C.actor(t)) throw changed();
    this.assertBinding(t, a);
    return a.chatId;
  }
  async readView(rpc, a, format = 'ansi') {
    const result = await rpc.request('agent.read', {
        target: a.block,
        source: 'visible',
        format,
        strip_ansi: format === 'text',
      }),
      r = result?.read;
    if (
      result?.type !== 'pane_read' ||
      r?.pane_id !== a.block ||
      r.workspace_id !== a.workspaceId ||
      r.tab_id !== a.window ||
      r.source !== 'visible' ||
      r.format !== format ||
      r.truncated !== false ||
      typeof r.text !== 'string' ||
      !r.text ||
      Buffer.byteLength(r.text) > 960000
    )
      throw Error('Herdr viewport incomplete');
    return r.text;
  }
  async requestHash(t) {
    return this.use(async (rpc) => {
      const a = await this.readAgent(rpc, t.block);
      if (
        !a ||
        C.actor(a) !== C.actor(t) ||
        !a.atBottom ||
        a.state !== 'blocked' ||
        !a.nativeVerified
      )
        throw Error('Native waiting UI unavailable');
      return crypto
        .createHash('sha256')
        .update(await this.readView(rpc, a))
        .digest('hex');
    });
  }
  async sendClaudeWaitingKey(a, key, kind) {
    if (
      a.app !== 'claude-code' ||
      !a.nativeVerified ||
      !a.claudeControlsEnabled ||
      !a.atBottom ||
      !['question', 'permission'].includes(kind)
    )
      throw Error('Claude waiting context unavailable');
    const picker = a.claudePicker === true,
      allowed =
        kind === 'permission'
          ? ['up', 'down', 'enter', 'escape']
          : [
              'up',
              'down',
              'left',
              'right',
              'enter',
              'escape',
              'tab',
              'shift+tab',
              ...(a.claudeMultiSelect ? ['space'] : []),
              ...(picker ? ['s'] : []),
            ];
    if (!allowed.includes(key)) throw Error('Unsupported Claude waiting key');
    return this.use(async (rpc) => {
      if (rpc.endpoint.scope !== a.session) throw changed();
      const [got, processes, paned, process, record] = await Promise.all([
        rpc.request('agent.get', { target: a.block }),
        rpc.request('pane.process_info', { pane_id: a.block }),
        rpc.request('pane.get', { pane_id: a.block }),
        this.claude.inspect(a.pid),
        this.claude.read(a.pid),
      ]);
      const info = validateInfo(got?.agent),
        pane = paned?.pane,
        p = foreground(info, processes?.process_info);
      if (
        info.agent !== 'claude' ||
        info.pane_id !== a.block ||
        info.terminal_id !== a.terminalId ||
        info.workspace_id !== a.workspaceId ||
        info.tab_id !== a.window ||
        !info.focused ||
        pane?.pane_id !== a.block ||
        pane.terminal_id !== a.terminalId ||
        pane.tab_id !== a.window ||
        pane.workspace_id !== a.workspaceId ||
        !pane.focused ||
        !p ||
        p.pid !== a.pid ||
        p.name !== a.name ||
        p.cwd !== a.cwd
      )
        throw changed();
      if (pane.scroll?.offset_from_bottom !== 0)
        throw Error('Scroll the Herdr pane to bottom');
      const S = require('./claude-state'),
        r = S.validate(record, a, process, this.claude.now()),
        binding = this.claude.bindings.get(C.actor(a)),
        defaults = await this.claude.bindingsDefault(r.configDirectory),
        root = [process.startedAt, r.sessionId, r.generation, defaults].join(
          '|',
        );
      if (
        !defaults ||
        !binding ||
        binding.root !== root ||
        binding.id !== a.nativeIdentity ||
        (binding.uiEpoch || 0) !== (a.claudeUiEpoch || 0) ||
        r.sessionId !== a.chatId ||
        r.turnId !== a.claudeTurnId
      )
        throw changed();
      if (picker) {
        if (
          this.claude.picker?.actor !== C.actor(a) ||
          this.claude.picker.identity !== a.nativeIdentity
        )
          throw changed();
      } else if (
        r.state !== 'blocked' ||
        r.kind !== kind ||
        r.requestId !== a.claudeRequestId ||
        this.claude.now() - r.updatedAt >= 300000
      )
        throw Error('Claude waiting request changed');
      const view = await this.claude.view(a, rpc),
        d = require('./claude-controls').dialog(
          view.text,
          picker ? 'picker' : kind,
        ),
        navigation = this.navigationContext(a, key);
      // Selection can move between arrow presses; the prompt body, exact private
      // request and root must remain identical. Confirm keeps its exact-view guard.
      if (navigation) {
        if (
          (['idle', 'done'].includes(info.agent_status) && !d.review) ||
          a.statusAt !==
            [r.generation, r.turnId, r.state, r.requestId || ''].join(':') +
              ':' +
              d.semantic
        )
          throw Error('Claude waiting request changed');
      } else if (view.hash !== a.claudeViewHash)
        throw Error('Claude waiting view changed');
      if (key === 'space' && !d.multiSelect)
        throw Error('Claude waiting view changed');
      const focus = await this.snapshot(rpc);
      if (
        focus.focused_pane_id !== a.block ||
        focus.focused_tab_id !== a.window ||
        focus.focused_workspace_id !== a.workspaceId
      )
        throw changed();
      const latest = S.validate(
        await this.claude.read(a.pid),
        a,
        process,
        this.claude.now(),
      );
      if (
        [
          'sessionId',
          'generation',
          'turnId',
          'state',
          'kind',
          'requestId',
          'toolId',
        ].some((field) => latest[field] !== r[field])
      )
        throw Error('Claude waiting request changed');
      await rpc.request('agent.send_keys', {
        target: a.block,
        keys: [key === 'escape' ? 'esc' : key],
      });
    });
  }
  async translate(args) {
    if (
      args[0] !== 'send-key' ||
      args.length < 6 ||
      args.length > 9 ||
      args[1] !== '-s' ||
      args[3] !== '-b'
    )
      throw Error(
        'Herdr does not expose a verified composer cursor; use its keyboard',
      );
    const keys = args.slice(5).map((key) => (key === 'escape' ? 'esc' : key)),
      key = keys[0],
      expected = this.actionContext?.target || this.lastChecked;
    return this.use(async (rpc) => {
      if (
        !expected ||
        args[2] !== rpc.endpoint.scope ||
        args[4] !== expected.block
      )
        throw changed();
      const s = await this.snapshot(rpc);
      if (s.focused_pane_id !== expected.block) throw changed();
      const a = await this.readAgent(rpc, expected.block);
      if (!a || C.actor(a) !== C.actor(expected) || !isFocused(s, a))
        throw changed();
      if (!a.nativeVerified) throw Error('Native agent state unavailable');
      if (!a.atBottom) throw Error('Scroll the Herdr pane to bottom');
      this.assertBinding(expected, a);
      if (this.actionContext) C.assertContext(this.actionContext, a);
      else if (a.app === 'claude-code')
        C.assertContext({ target: expected, action: 'nativeKey' }, a);
      const allowed =
        a.state === 'blocked'
          ? a.kind === 'permission'
            ? ['up', 'down', 'enter', 'esc']
            : a.kind === 'question'
              ? [
                  'up',
                  'down',
                  'left',
                  'right',
                  'enter',
                  'esc',
                  'tab',
                  'shift+tab',
                  ...(a.app === 'claude-code' && a.claudeMultiSelect
                    ? ['space']
                    : []),
                ]
              : []
          : a.state === 'working'
            ? ['esc']
            : ['idle', 'done', 'error'].includes(a.state)
              ? ['shift+tab']
              : [];
      const configuration = keys.every((key) =>
        this.claude.configurationKeyAllowed(a, key),
      );
      if (
        keys.length > 1 &&
        (!configuration ||
          keys.some((key) => key !== keys[0]) ||
          !['up', 'down', 'left', 'right'].includes(key))
      )
        throw Error(
          'Arrow batches require an owned Claude configuration picker',
        );
      if (!allowed.includes(key) && !configuration)
        throw Error('Native control does not match the Herdr agent state');
      if (configuration) {
        if (this.claude.picker.pending) {
          const view = await this.claude.view(a);
          if (
            require('./claude-cycle').configurationView(view) !==
            this.claude.picker.composerHash
          )
            throw Error('Claude composer changed');
        } else if (a.claudeViewHash !== this.claude.picker.expectedViewHash)
          throw Error('Claude picker changed');
      }
      await rpc.request('agent.send_keys', { target: a.block, keys });
    });
  }
  async zoom() {
    const a = await this.focused();
    await this.checked(a, false, false);
    return this.use(async (rpc) => {
      const current = await this.readAgent(rpc, a.block),
        s = await this.snapshot(rpc);
      if (!current || C.actor(current) !== C.actor(a) || !isFocused(s, current))
        throw changed();
      const r = await rpc.request('pane.zoom', {
        pane_id: a.block,
        mode: 'toggle',
      });
      if (r?.type !== 'pane_zoom' || r.zoom?.pane_id !== a.block)
        throw Error('Herdr zoom unconfirmed');
    });
  }
  async cycleControl(kind) {
    const a = await this.providerAgent();
    if (a.app === 'claude-code') return this.claude.cycle(kind, a);
    if (
      !this.config.daemonControls?.enabled ||
      (kind === 'permissions' && !this.config.daemonControls.permissionsEnabled)
    )
      throw Error('Herdr requires native daemon controls');
    return super.cycleControl(kind);
  }
  async stage() {
    throw Error('Use the Herdr keyboard; verified draft cursor unavailable');
  }
  async send() {
    throw Error('Use the Herdr keyboard; verified draft cursor unavailable');
  }
  async submitRunning() {
    throw Error('Herdr Steer/Queue need a verified composer cursor');
  }
  async adjustEffort() {
    throw Error('Use the cycling native Effort control');
  }
}
module.exports = { HerdrBridge, foreground, validateInfo };
