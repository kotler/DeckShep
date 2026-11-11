type DaemonRpc = import('./daemon').DaemonRpc;
type AgentSnapshot = import('../../domain/types').AgentSnapshot;
('use strict');
const { socketFor, DaemonRpc, loadedThread } = require('./daemon');
const { readIdentity } = require('./hook-identity');
/** Shown in the setup panel (at most 160 characters). */
const FOOTER_HELP =
  'No verified Codex identity. Review DeckShep in /hooks, or run /statusline session-id model-with-reasoning in Codex, then check again.';
/**
 * Read-only Codex identity check. The owner rule (2026-11-08) is that DeckShep
 * never changes a Codex status line, so this only reads the pane and the
 * daemon: it sends no keys or text, stores no preset and writes no state.
 * Codex controls in Rex bind through a verified hook or the user's footer;
 * this confirms that the ID names a loaded chat in the pane's folder.
 */
async function check(
  bridge: Record<string, any>,
  agent: AgentSnapshot,
  deps: Record<string, any> = {},
) {
  const footer = deps.footer || readIdentity,
    locate = deps.socketFor || socketFor,
    connect =
      deps.connect ||
      (async (socket: string) => {
        const rpc: DaemonRpc = new DaemonRpc(socket);
        try {
          await rpc.connect();
          return rpc;
        } catch (error: unknown) {
          rpc.close();
          throw error;
        }
      });
  let id: string;
  try {
    id = await footer(bridge, agent);
  } catch (error: unknown) {
    if ((error as Error & { code?: string }).code === 'FOOTER_MISSING')
      throw Error(FOOTER_HELP);
    throw error;
  }
  const endpoint: { pid: number; socket: string } = await locate(agent.pid),
    rpc: DaemonRpc = await connect(endpoint.socket);
  try {
    const thread: { id: any; model: any; effort: any; cwd: any } =
      await loadedThread(rpc, id);
    if (thread.cwd !== agent.cwd)
      throw Error('Pane directory does not match thread');
    return {
      pid: agent.pid,
      threadId: id,
      model: thread.model,
      effort: thread.effort,
    };
  } finally {
    rpc.close();
  }
}
module.exports = { check, FOOTER_HELP };

export {};
