import type { AgentSnapshot, TargetRef } from './types';

/** Physical pane selection survives provider hook/metadata availability changes. */
export function sameNavigationTarget(
  left: TargetRef | null | undefined,
  right: TargetRef | null | undefined,
): boolean {
  return !!(
    left &&
    right &&
    left.session === right.session &&
    left.block === right.block &&
    left.pid === right.pid &&
    (!left.app || !right.app || left.app === right.app) &&
    (!left.name || !right.name || left.name === right.name) &&
    (left.terminalId || null) === (right.terminalId || null)
  );
}

/** Explicit allowlist: navigation never carries a provider identity or permit. */
export function navigationSnapshot(agent: AgentSnapshot): AgentSnapshot {
  return {
    session: agent.session,
    window: agent.window,
    block: agent.block,
    pid: agent.pid,
    app: agent.app,
    name: agent.name,
    cwd: agent.cwd,
    state: agent.state,
    kind: agent.kind,
    statusAt: agent.statusAt,
    project: agent.project,
    terminalTitle: agent.terminalTitle,
    sessionLabel: agent.sessionLabel,
    chatName:
      agent.terminalTitle ||
      agent.sessionLabel ||
      (agent.app === 'claude-code' ? 'Claude Code' : 'Codex'),
  };
}
