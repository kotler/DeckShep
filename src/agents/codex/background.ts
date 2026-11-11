type DaemonRpc = import('./daemon').DaemonRpc;
type AgentSnapshot = import('../../domain/types').AgentSnapshot;
type Config = import('../../domain/types').Config;
type PressContext = import('../../domain/types').PressContext;
('use strict');
const {
  DaemonRpc,
  socketFor,
  readFooter,
  knownServerVersion: supported,
} = require('./daemon');
const validId: (id: any) => boolean = (id: any) =>
  typeof id === 'string' &&
  id.length > 0 &&
  id.length <= 256 &&
  !/[\x00-\x1f\x7f]/.test(id);
const sameIds: (a: any, b: any) => boolean = (a: any, b: any) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
async function latestTurn(rpc: Record<string, any>, id: any) {
  const result: any = await rpc.request('thread/turns/list', {
      threadId: id,
      limit: 1,
      sortDirection: 'desc',
      itemsView: 'notLoaded',
    }),
    turn: any = result?.data?.[0];
  if (
    !Array.isArray(result?.data) ||
    result.data.length !== 1 ||
    !validId(turn?.id) ||
    turn.itemsView !== 'notLoaded' ||
    !Array.isArray(turn.items) ||
    turn.items.length ||
    !['inProgress', 'completed', 'interrupted', 'failed'].includes(turn.status)
  )
    throw Error('Turn metadata unavailable');
  return { id: turn.id, status: turn.status };
}
async function terminalIds(rpc: Record<string, any>, id: any) {
  if (!supported(rpc.serverVersion))
    throw Error('Background-terminal daemon version unavailable');
  let cursor: any = null;
  const ids: string[] = [],
    seen: Set<any> = new Set();
  for (let page: number = 0; page < 20; page++) {
    const result: any = await rpc.request('thread/backgroundTerminals/list', {
      threadId: id,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    if (!Array.isArray(result?.data) || !Object.hasOwn(result, 'nextCursor'))
      throw Error('Terminal list incomplete');
    for (const item of result.data) {
      if (!validId(item?.processId) || ids.includes(item.processId))
        throw Error('Terminal identity unavailable');
      ids.push(item.processId);
    }
    if (result.nextCursor === null) return ids.sort();
    if (!validId(result.nextCursor) || seen.has(result.nextCursor))
      throw Error('Terminal pagination incomplete');
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw Error('Terminal list incomplete');
}
function accepting(thread: any) {
  return (
    thread?.status?.type === 'idle' ||
    (thread?.status?.type === 'active' &&
      Array.isArray(thread.status.activeFlags) &&
      thread.status.activeFlags.length === 0)
  );
}
async function backgroundState(
  rpc: Record<string, any>,
  id: any,
  thread: any,
  turn?: any,
) {
  if (!accepting(thread)) return null;
  turn ??= await latestTurn(rpc, id);
  if (turn.status === 'inProgress') return null;
  const ids: string[] = await terminalIds(rpc, id);
  if (!ids.length) return null;
  return {
    backgroundOnly: true,
    backgroundIds: ids,
    backgroundTurnId: turn.id,
  };
}
class BackgroundControls {
  declare b: Record<string, any>;
  declare socketFor: any;
  declare footer: any;
  declare connect: any;
  constructor(
    bridge: Record<string, any>,
    deps: Record<string, any> | undefined = {},
  ) {
    this.b = bridge;
    this.socketFor = deps.socketFor || socketFor;
    this.footer = deps.footer || readFooter;
    this.connect =
      deps.connect ||
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
  async running(agent: import('../../domain/types').AgentSnapshot) {
    const endpoint: any = await this.socketFor(agent.pid),
      rpc: any = await this.connect(endpoint);
    try {
      const id: any = await this.footer(this.b, agent),
        expected: any = this.b.actionContext?.target;
      if (expected?.chatId && expected.chatId !== id)
        throw Error('Selected chat changed');
      const thread: any = (
        await rpc.request('thread/read', { threadId: id, includeTurns: false })
      )?.thread;
      if (
        thread?.id !== id ||
        thread.cwd !== agent.cwd ||
        thread.status?.type !== 'active' ||
        !accepting(thread)
      )
        throw Error('No agent turn to interrupt');
      const turn: {
        id: any;
        status: any;
      } = await latestTurn(rpc, id);
      if (turn.status !== 'inProgress')
        throw Error('Only background terminals remain');
      if (expected?.runId && turn.id !== expected.runId)
        throw Error('Agent started a new turn');
      if ((await this.footer(this.b, agent)) !== id)
        throw Error('Selected chat changed');
      return { chatId: id, runId: turn.id };
    } finally {
      rpc.close();
    }
  }
  async stop(agent: import('../../domain/types').AgentSnapshot) {
    if (
      agent.app !== 'codex' ||
      !agent.backgroundOnly ||
      !agent.chatId ||
      !agent.backgroundTurnId ||
      !Array.isArray(agent.backgroundIds) ||
      !agent.backgroundIds.length
    )
      throw Error('No verified background terminals');
    const endpoint: any = await this.socketFor(agent.pid),
      rpc: any = await this.connect(endpoint),
      id: string = agent.chatId,
      expected: string[] = [...agent.backgroundIds].sort();
    try {
      if (!supported(rpc.serverVersion))
        throw Error('Background-terminal daemon version unavailable');
      const verify: (ids: any) => Promise<void> = async (ids: any) => {
        const current: any = await this.b.checked(agent);
        if (
          !['working', 'idle', 'done'].includes(current.state) ||
          (await this.footer(this.b, current)) !== id
        )
          throw Error('Agent or chat changed');
        const latest: any = await this.socketFor(agent.pid);
        if (latest.pid !== endpoint.pid || latest.socket !== endpoint.socket)
          throw Error('Daemon changed');
        const thread: any = (
          await rpc.request('thread/read', {
            threadId: id,
            includeTurns: false,
          })
        )?.thread;
        if (thread?.id !== id || thread.cwd !== agent.cwd || !accepting(thread))
          throw Error('Chat no longer ready');
        const turn: {
          id: any;
          status: any;
        } = await latestTurn(rpc, id);
        if (turn.id !== agent.backgroundTurnId || turn.status === 'inProgress')
          throw Error('Agent started a new turn');
        if (!sameIds(await terminalIds(rpc, id), ids))
          throw Error('Background terminals changed; press again');
      };
      await verify(expected);
      const key: string = JSON.stringify([
        agent.session,
        agent.block,
        agent.pid,
        id,
        agent.backgroundTurnId,
        expected,
      ]);
      if (this.b.lastBackgroundStop === key)
        throw Error('Stop already requested; check Rex');
      this.b.lastBackgroundStop = key;
      const remaining: string[] = [...expected];
      for (const processId of expected) {
        await verify(remaining);
        const result: any = await this.b.deliverMutation(
          agent,
          'thread/backgroundTerminals/terminate',
          (beforeWrite: () => void) =>
            rpc.request(
              'thread/backgroundTerminals/terminate',
              { threadId: id, processId },
              beforeWrite,
            ),
        );
        if (result?.terminated !== true)
          throw Error('Terminal stop unconfirmed; check Rex');
        remaining.splice(remaining.indexOf(processId), 1);
      }
      if (
        (await terminalIds(rpc, id)).some((id: string) => expected.includes(id))
      )
        throw Error('Terminal stop unconfirmed; check Rex');
      return { kind: 'stopTerminals', label: 'Stopped' };
    } finally {
      rpc.close();
    }
  }
}
module.exports = {
  BackgroundControls,
  latestTurn,
  terminalIds,
  backgroundState,
  sameIds,
};

export { BackgroundControls };
