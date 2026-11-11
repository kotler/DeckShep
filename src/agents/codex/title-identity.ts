type AgentSnapshot = import('../../domain/types').AgentSnapshot;
type Config = import('../../domain/types').Config;
type PressContext = import('../../domain/types').PressContext;
('use strict');
const fs = require('node:fs'),
  crypto = require('node:crypto');
const D = require('./daemon'),
  { latestTurn, backgroundState } = require('./background');
const uuid: (s: any) => boolean = (s: any) =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s);
function titlePrefix(title: string) {
  if (uuid(title)) return title;
  const match: false | RegExpExecArray | null =
    typeof title === 'string' &&
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{5})\.\.\.$/.exec(
      title,
    );
  if (!match) throw Error('In Codex, run /title thread-id');
  return match[1];
}
function socketIdentity(endpoint: any) {
  const s: import('node:fs').BigIntStats = fs.lstatSync(endpoint.socket, {
    bigint: true,
  });
  D.safeSocket(endpoint.socket);
  return crypto
    .createHash('sha256')
    .update([endpoint.pid, endpoint.socket, s.dev, s.ino].join('|'))
    .digest('hex');
}
async function loadedIds(rpc: Record<string, any>) {
  const ids: string[] = [],
    cursors: Set<any> = new Set();
  let cursor: any = null;
  for (let page: number = 0; page < 20; page++) {
    const r: any = await rpc.request('thread/loaded/list', {
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    if (
      !Array.isArray(r?.data) ||
      !r.data.every(uuid) ||
      !Object.hasOwn(r, 'nextCursor')
    )
      throw Error('Loaded chat IDs incomplete');
    for (const id of r.data) {
      if (ids.includes(id)) throw Error('Loaded chat IDs ambiguous');
      ids.push(id);
    }
    if (r.nextCursor === null) return ids;
    if (
      typeof r.nextCursor !== 'string' ||
      !r.nextCursor ||
      cursors.has(r.nextCursor)
    )
      throw Error('Loaded chat pagination incomplete');
    cursors.add(r.nextCursor);
    cursor = r.nextCursor;
  }
  throw Error('Loaded chat pagination incomplete');
}
class TitleIdentity {
  declare socketFor: any;
  declare socketIdentity: any;
  declare connect: any;
  constructor(deps: Record<string, any> | undefined = {}) {
    this.socketFor = deps.socketFor || D.socketFor;
    this.socketIdentity = deps.socketIdentity || socketIdentity;
    this.connect =
      deps.connect ||
      ((async (endpoint: { socket: string }) => {
        const rpc: import('./daemon').DaemonRpc = new D.DaemonRpc(
          endpoint.socket,
        );
        try {
          await rpc.connect();
          return rpc;
        } catch (e: unknown) {
          rpc.close();
          throw e;
        }
      }) as (endpoint: {
        socket: string;
      }) => Promise<import('./daemon').DaemonRpc>);
  }
  async resolve(
    agent: import('../../domain/types').AgentSnapshot,
    title: string,
  ) {
    const prefix: string = titlePrefix(title),
      endpoint: any = await this.socketFor(agent.pid),
      identity: any = this.socketIdentity(endpoint),
      rpc: any = await this.connect(endpoint);
    try {
      if (!D.knownServerVersion(rpc.serverVersion))
        throw Error('Codex title identity version unavailable');
      const matches: string[] = (await loadedIds(rpc)).filter((id: string) =>
        id.startsWith(prefix),
      );
      if (matches.length !== 1)
        throw Error(
          matches.length
            ? 'Title matches multiple chats'
            : 'Title chat is not loaded',
        );
      const id: string = matches[0],
        t: any = (
          await rpc.request('thread/read', {
            threadId: id,
            includeTurns: false,
          })
        )?.thread;
      if (
        t?.id !== id ||
        t.cwd !== agent.cwd ||
        t.parentThreadId !== null ||
        !['cli', 'vscode'].includes(t.source)
      )
        throw Error(
          'Title must identify a root interactive chat in this folder',
        );
      if (!['idle', 'active', 'systemError'].includes(t.status?.type))
        throw Error('Codex chat unavailable');
      const status: any = { ...t.status };
      if (
        status.type === 'active' &&
        (!Array.isArray(status.activeFlags) ||
          status.activeFlags.length > 1 ||
          status.activeFlags.some(
            (f: any) =>
              !['waitingOnApproval', 'waitingOnUserInput'].includes(f),
          ))
      )
        throw Error('Codex waiting state unavailable');
      if (status.type === 'active' && !status.activeFlags.length) {
        const turn: {
          id: any;
          status: any;
        } = await latestTurn(rpc, id);
        if (turn.status === 'inProgress') status.runId = turn.id;
        else {
          const bg: {
            backgroundOnly: boolean;
            backgroundIds: string[];
            backgroundTurnId: any;
          } | null = await backgroundState(rpc, id, t, turn);
          if (!bg) throw Error('Active turn unavailable');
          Object.assign(status, bg);
        }
      } else if (status.type === 'idle')
        try {
          Object.assign(status, (await backgroundState(rpc, id, t)) || {});
        } catch {}
      const latest: any = await this.socketFor(agent.pid);
      if (this.socketIdentity(latest) !== identity)
        throw Error('Codex daemon changed; reselect agent');
      return { chatId: id, nativeIdentity: identity, status };
    } finally {
      rpc.close();
    }
  }
}
module.exports = { TitleIdentity, titlePrefix, loadedIds };

export { TitleIdentity };
