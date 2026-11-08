type DaemonRpc = import('./daemon').DaemonRpc;
type AgentSnapshot = import('../../domain/types').AgentSnapshot;
type Config = import('../../domain/types').Config;
type PressContext = import('../../domain/types').PressContext;
('use strict');
const path = require('node:path');
const {
  DaemonRpc,
  socketFor,
  readFooter,
  readPermissionSettings,
} = require('./daemon');
const { latestTurn, backgroundState } = require('./background');
const key: (agent: AgentSnapshot) => string = (
  agent: import('../../domain/types').AgentSnapshot,
) =>
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
const activityFields: string[] = [
  'backgroundOnly',
  'backgroundIds',
  'backgroundTurnId',
  'activityStatusAt',
];
function restore(
  agent: import('../../domain/types').AgentSnapshot,
  value: any,
) {
  const native: boolean = agent.backend === 'herdr',
    authoritative: string[] = [...activityFields, 'runId'];
  for (const [field, item] of Object.entries(value))
    if (
      !(native && authoritative.includes(field)) &&
      (!activityFields.includes(field) ||
        value.activityStatusAt === agent.statusAt)
    )
      (agent as Record<string, any>)[field] = item;
  if (!native && value.activityStatusAt !== agent.statusAt) {
    agent.backgroundOnly = false;
    agent.backgroundIds = [];
    agent.backgroundTurnId = null;
  }
}
class AgentMetadata {
  declare b: Record<string, any>;
  declare cache: Map<any, any>;
  declare now: any;
  declare socketFor: any;
  declare footer: any;
  declare settings: any;
  declare connect: any;
  constructor(bridge: Record<string, any>, dependencies: any = {}) {
    this.b = bridge;
    this.cache = new Map();
    this.now = dependencies.now || Date.now;
    this.socketFor = dependencies.socketFor || socketFor;
    this.footer = dependencies.footer || readFooter;
    this.settings = dependencies.settings || readPermissionSettings;
    this.connect =
      dependencies.connect ||
      ((async (endpoint: { socket: string }) => {
        const rpc: DaemonRpc = new DaemonRpc(endpoint.socket);
        try {
          await rpc.connect();
          return rpc;
        } catch (error: unknown) {
          rpc.close();
          throw error;
        }
      }) as (endpoint: { socket: string }) => Promise<DaemonRpc>);
  }
  hydrate(agents: import('../../domain/types').AgentSnapshot[]) {
    for (const agent of agents) {
      if (agent.app !== 'codex') continue;
      const cached: any = this.cache.get(key(agent));
      if (cached) restore(agent, cached.value);
    }
  }
  async read(agent: import('../../domain/types').AgentSnapshot) {
    const started: any = this.now(),
      endpoint: any = await this.socketFor(agent.pid),
      rpc: any = await this.connect(endpoint);
    try {
      const id: any = await this.footer(this.b, agent);
      let cursor: any = null,
        found: boolean = false;
      for (let page: number = 0; page < 20; page++) {
        const list: any = await rpc.request('thread/loaded/list', {
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
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
      const result: any = await rpc.request('thread/read', {
          threadId: id,
          includeTurns: false,
        }),
        thread: any = result?.thread;
      if (
        thread?.id !== id ||
        typeof thread.cwd !== 'string' ||
        thread.cwd !== agent.cwd ||
        (await this.footer(this.b, agent)) !== id
      )
        throw Error('Chat identity changed');
      let runId: any = null,
        activity: {
          backgroundOnly: boolean;
          backgroundIds: never[];
          backgroundTurnId: null;
          activityStatusAt: string | undefined;
        } = {
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
          const turn: {
            id: any;
            status: any;
          } = await latestTurn(rpc, id);
          if (turn.status === 'inProgress' && thread.status?.type === 'active')
            runId = turn.id;
          else {
            const background: {
              backgroundOnly: boolean;
              backgroundIds: string[];
              backgroundTurnId: any;
            } | null = await backgroundState(rpc, id, thread, turn);
            if (background && (await this.footer(this.b, agent)) === id)
              Object.assign(activity, background);
          }
        } catch {}
      let collaborationMode: any = null,
        reviewer: any = null;
      if (thread.status?.type === 'idle')
        try {
          const settings: any = await this.settings(rpc, id);
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
  async refresh(
    agents: import('../../domain/types').AgentSnapshot[],
    force: any = false,
  ) {
    const live: Set<string> = new Set(agents.map(key));
    for (const id of this.cache.keys())
      if (!live.has(id)) this.cache.delete(id);
    this.hydrate(agents);
    for (const agent of agents) {
      if (
        agent.app !== 'codex' ||
        (agent.backend === 'herdr' && agent.nativeVerified !== true)
      )
        continue;
      const id: string = key(agent),
        cached: any = this.cache.get(id),
        now: any = this.now(),
        ttl: any = this.b.config.metadataRefreshMs ?? 4000;
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
        const value: {
          metadataAt: any;
          backgroundOnly: boolean;
          backgroundIds: never[];
          backgroundTurnId: null;
          activityStatusAt: string | undefined;
          chatId: any;
          chatName: any;
          project: any;
          model: any;
          effort: any;
          collaborationMode: any;
          reviewer: any;
          runId: any;
        } = await this.read(agent);
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

export { AgentMetadata };
