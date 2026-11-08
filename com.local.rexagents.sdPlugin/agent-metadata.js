// @ts-check
/** @typedef {import("../src/domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../src/domain/types").Config} Config */
/** @typedef {import("../src/domain/types").PressContext} PressContext */
'use strict';
const path = require('node:path');
const {
  DaemonRpc,
  socketFor,
  readFooter,
  readPermissionSettings,
} = require('./daemon-controls');
const { latestTurn, backgroundState } = require('./background-controls');
const key =
  /** @param {AgentSnapshot} agent */
  (agent) =>
    [
      agent.session,
      agent.block,
      agent.app,
      agent.pid,
      agent.cwd,
      agent.terminalId || '',
      agent.herdrChatId || '',
      agent.nativeIdentity || '',
    ].join('|');
const activityFields = [
  'backgroundOnly',
  'backgroundIds',
  'backgroundTurnId',
  'activityStatusAt',
];
/** @param {AgentSnapshot} agent
 * @param {any} value */
function restore(agent, value) {
  const native = agent.backend === 'herdr',
    authoritative = [...activityFields, 'runId'];
  for (const [field, item] of Object.entries(value))
    if (
      !(native && authoritative.includes(field)) &&
      (!activityFields.includes(field) ||
        value.activityStatusAt === agent.statusAt)
    )
      /** @type {Record<string, any>} */ (agent)[field] = item;
  if (!native && value.activityStatusAt !== agent.statusAt) {
    agent.backgroundOnly = false;
    agent.backgroundIds = [];
    agent.backgroundTurnId = null;
  }
}
class AgentMetadata {
  /** @param {Record<string, any>} bridge
   * @param {any} [dependencies] */
  constructor(bridge, dependencies = {}) {
    this.b = bridge;
    this.cache = new Map();
    this.now = dependencies.now || Date.now;
    this.socketFor = dependencies.socketFor || socketFor;
    this.footer = dependencies.footer || readFooter;
    this.settings = dependencies.settings || readPermissionSettings;
    this.connect =
      dependencies.connect ||
      /** @type {(endpoint: {socket: string}) => Promise<DaemonRpc>} */ (
        async (endpoint) => {
          const rpc = new DaemonRpc(endpoint.socket);
          try {
            await rpc.connect();
            return rpc;
          } catch (error) {
            rpc.close();
            throw error;
          }
        }
      );
  }
  /** @param {AgentSnapshot[]} agents */
  hydrate(agents) {
    // Discovery creates new objects every poll. Restore all known labels synchronously,
    // before any render or awaited metadata read can expose a temporary fallback.
    for (const agent of agents) {
      if (agent.app !== 'codex') continue;
      const cached = this.cache.get(key(agent));
      if (cached) restore(agent, cached.value);
    }
  }
  /** @param {AgentSnapshot} agent */
  async read(agent) {
    const started = this.now(),
      endpoint = await this.socketFor(agent.pid),
      rpc = await this.connect(endpoint);
    try {
      const id = await this.footer(this.b, agent);
      let cursor = null,
        found = false;
      for (let page = 0; page < 20; page++) {
        const /** @type {any} */ list = await rpc.request(
            'thread/loaded/list',
            {
              limit: 100,
              ...(cursor ? { cursor } : {}),
            },
          );
        if (!Array.isArray(list?.data))
          throw Error('Loaded metadata unavailable');
        if (list.data.includes(id)) {
          found = true;
          break;
        }
        cursor = list.nextCursor;
        if (!cursor) break;
      }
      if (!found) throw Error('Chat not loaded');
      const result = await rpc.request('thread/read', {
          threadId: id,
          includeTurns: false,
        }),
        thread = result?.thread;
      if (
        thread?.id !== id ||
        typeof thread.cwd !== 'string' ||
        thread.cwd !== agent.cwd ||
        (await this.footer(this.b, agent)) !== id
      )
        throw Error('Chat identity changed');
      let runId = null,
        activity = {
          backgroundOnly: false,
          backgroundIds: [],
          backgroundTurnId: null,
          activityStatusAt: agent.statusAt,
        };
      if (
        this.b.backend !== 'herdr' &&
        (thread.status?.type === 'active' || agent.state === 'working')
      )
        try {
          const turn = await latestTurn(rpc, id);
          if (turn.status === 'inProgress' && thread.status?.type === 'active')
            runId = turn.id;
          else {
            const background = await backgroundState(rpc, id, thread, turn);
            if (background && (await this.footer(this.b, agent)) === id)
              Object.assign(activity, background);
          }
        } catch {}
      let collaborationMode = null,
        reviewer = null;
      if (thread.status?.type === 'idle')
        try {
          const settings = await this.settings(rpc, id);
          if (
            settings.cwd === agent.cwd &&
            (await this.footer(this.b, agent)) === id
          ) {
            if (['plan', 'default'].includes(settings.collaborationMode?.mode))
              collaborationMode = settings.collaborationMode.mode;
            if (['user', 'auto_review'].includes(settings.reviewer))
              reviewer = settings.reviewer;
          }
        } catch {}
      // Names and active-turn IDs are metadata; never retain previews or turn items.
      return {
        chatId: id,
        chatName:
          typeof thread.name === 'string' && thread.name.trim()
            ? thread.name.trim()
            : this.b.backend === 'herdr' && agent.chatName
              ? agent.chatName
              : 'Untitled chat',
        project:
          this.b.config.projectAliases?.[thread.cwd] ||
          path.basename(thread.cwd) ||
          agent.project,
        model: typeof thread.model === 'string' ? thread.model : null,
        effort:
          typeof thread.reasoningEffort === 'string'
            ? thread.reasoningEffort
            : null,
        collaborationMode,
        reviewer,
        runId,
        ...activity,
        metadataAt: started,
      };
    } finally {
      rpc.close();
    }
  }
  /** @param {AgentSnapshot[]} agents
   * @param {any} [force] */
  async refresh(agents, force = false) {
    const live = new Set(agents.map(key));
    for (const id of this.cache.keys())
      if (!live.has(id)) this.cache.delete(id);
    this.hydrate(agents);
    for (const agent of agents) {
      if (
        agent.app !== 'codex' ||
        (agent.backend === 'herdr' && agent.nativeVerified !== true)
      )
        continue;
      const id = key(agent),
        cached = this.cache.get(id),
        now = this.now(),
        ttl = this.b.config.metadataRefreshMs ?? 4000;
      if (
        !force &&
        cached &&
        now - cached.at < ttl &&
        cached.statusAt === agent.statusAt
      ) {
        restore(agent, cached.value);
        continue;
      }
      try {
        const value = await this.read(agent);
        this.cache.set(id, { at: now, statusAt: agent.statusAt, value });
        restore(agent, value);
      } catch {
        if (cached) {
          cached.value = {
            ...cached.value,
            backgroundOnly: false,
            backgroundIds: [],
            backgroundTurnId: null,
          };
          restore(agent, cached.value);
        } else if (this.b.backend !== 'herdr' || !agent.chatName)
          agent.chatName = 'Name unavailable';
      }
    }
    return agents;
  }
}
module.exports = { AgentMetadata };
