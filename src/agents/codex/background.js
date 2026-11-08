// @ts-check
/** @typedef {import("../../domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../../domain/types").Config} Config */
/** @typedef {import("../../domain/types").PressContext} PressContext */
'use strict';
const { DaemonRpc, socketFor, readFooter } = require('./daemon');
const supported =
  /** @param {string} version */
  (version) => ['0.166.0', '0.167.0'].includes(version);
const validId =
  /** @param {any} id */
  (id) =>
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 256 &&
    !/[\x00-\x1f\x7f]/.test(id);
const sameIds =
  /** @param {any} a
   * @param {any} b */
  (a, b) =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
/** @param {Record<string, any>} rpc
 * @param {any} id */
async function latestTurn(rpc, id) {
  const result = await rpc.request('thread/turns/list', {
      threadId: id,
      limit: 1,
      sortDirection: 'desc',
      itemsView: 'notLoaded',
    }),
    turn = result?.data?.[0];
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
/** @param {Record<string, any>} rpc
 * @param {any} id */
async function terminalIds(rpc, id) {
  if (!supported(rpc.serverVersion))
    throw Error('Background-terminal daemon version not verified');
  let cursor = null;
  const /** @type {string[]} */ ids = [],
    seen = new Set();
  for (let page = 0; page < 20; page++) {
    const /** @type {any} */ result = await rpc.request(
        'thread/backgroundTerminals/list',
        {
          threadId: id,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        },
      );
    if (!Array.isArray(result?.data) || !Object.hasOwn(result, 'nextCursor'))
      throw Error('Terminal list incomplete');
    // Retain identifiers only, never command text, cwd, output or resource statistics.
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
/** @param {any} thread */
function accepting(thread) {
  return (
    thread?.status?.type === 'idle' ||
    (thread?.status?.type === 'active' &&
      Array.isArray(thread.status.activeFlags) &&
      thread.status.activeFlags.length === 0)
  );
}
/** @param {Record<string, any>} rpc
 * @param {any} id
 * @param {any} thread
 * @param {any} [turn] */
async function backgroundState(rpc, id, thread, turn) {
  if (!accepting(thread)) return null;
  turn ??= await latestTurn(rpc, id);
  if (turn.status === 'inProgress') return null;
  const ids = await terminalIds(rpc, id);
  if (!ids.length) return null;
  return {
    backgroundOnly: true,
    backgroundIds: ids,
    backgroundTurnId: turn.id,
  };
}
class BackgroundControls {
  /** @param {Record<string, any>} bridge
   * @param {Record<string, any>} [deps] */
  constructor(bridge, deps = {}) {
    this.b = bridge;
    this.socketFor = deps.socketFor || socketFor;
    this.footer = deps.footer || readFooter;
    this.connect =
      deps.connect ||
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
  /** @param {AgentSnapshot} agent */
  async running(agent) {
    const endpoint = await this.socketFor(agent.pid),
      rpc = await this.connect(endpoint);
    try {
      const id = await this.footer(this.b, agent),
        expected = this.b.actionContext?.target;
      if (expected?.chatId && expected.chatId !== id)
        throw Error('Selected chat changed');
      const thread = (
        await rpc.request('thread/read', { threadId: id, includeTurns: false })
      )?.thread;
      if (
        thread?.id !== id ||
        thread.cwd !== agent.cwd ||
        thread.status?.type !== 'active' ||
        !accepting(thread)
      )
        throw Error('No agent turn to interrupt');
      const turn = await latestTurn(rpc, id);
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
  /** @param {AgentSnapshot} agent */
  async stop(agent) {
    if (
      agent.app !== 'codex' ||
      !agent.backgroundOnly ||
      !agent.chatId ||
      !agent.backgroundTurnId ||
      !Array.isArray(agent.backgroundIds) ||
      !agent.backgroundIds.length
    )
      throw Error('No verified background terminals');
    const endpoint = await this.socketFor(agent.pid),
      rpc = await this.connect(endpoint),
      id = agent.chatId,
      expected = [...agent.backgroundIds].sort();
    try {
      if (!supported(rpc.serverVersion))
        throw Error('Background-terminal daemon version not verified');
      const verify =
        /** @param {any} ids */
        async (ids) => {
          const current = await this.b.checked(agent);
          if (
            !['working', 'idle', 'done'].includes(current.state) ||
            (await this.footer(this.b, current)) !== id
          )
            throw Error('Agent or chat changed');
          const latest = await this.socketFor(agent.pid);
          if (latest.pid !== endpoint.pid || latest.socket !== endpoint.socket)
            throw Error('Daemon changed');
          const thread = (
            await rpc.request('thread/read', {
              threadId: id,
              includeTurns: false,
            })
          )?.thread;
          if (
            thread?.id !== id ||
            thread.cwd !== agent.cwd ||
            !accepting(thread)
          )
            throw Error('Chat no longer ready');
          const turn = await latestTurn(rpc, id);
          if (
            turn.id !== agent.backgroundTurnId ||
            turn.status === 'inProgress'
          )
            throw Error('Agent started a new turn');
          if (!sameIds(await terminalIds(rpc, id), ids))
            throw Error('Background terminals changed; press again');
        };
      await verify(expected);
      const key = JSON.stringify([
        agent.session,
        agent.block,
        agent.pid,
        id,
        agent.backgroundTurnId,
        expected,
      ]);
      if (this.b.lastBackgroundStop === key)
        throw Error('Stop already requested; check Rex');
      this.b.lastBackgroundStop = key; // Consume before the first mutation, including uncertain writes.
      const remaining = [...expected];
      for (const processId of expected) {
        await verify(remaining);
        const result = await rpc.request(
          'thread/backgroundTerminals/terminate',
          { threadId: id, processId },
        );
        if (result?.terminated !== true)
          throw Error('Terminal stop unconfirmed; check Rex');
        remaining.splice(remaining.indexOf(processId), 1);
      }
      if ((await terminalIds(rpc, id)).some((id) => expected.includes(id)))
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
