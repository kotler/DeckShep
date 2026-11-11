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

/** Why an agent wants the user: waiting on a reply, failed, or finished. */
export type AttentionKind = 'waiting' | 'error' | 'done';

/** One slot as the agent keys see it, in slot order. */
export interface AttentionEntry<A> {
  /** The agent filling the slot. */
  agent: A;
  /** The completion-adjusted state the agent key displays. */
  state: string;
  /** This is the agent the controls act on. */
  selected: boolean;
}

export interface AttentionCandidate<A> {
  agent: A;
  kind: AttentionKind;
  /** Index into the supplied entries, which is the slot index. */
  slot: number;
}

const ATTENTION_RANK: Record<AttentionKind, number> = {
  waiting: 0,
  error: 1,
  done: 2,
};

function attentionKind(state: string): AttentionKind | null {
  if (state === 'blocked') return 'waiting';
  if (state === 'error') return 'error';
  if (state === 'done') return 'done';
  return null;
}

/**
 * Agents other than the selected one that need the user, best first:
 * blocked, then error, then done; ties keep slot order. `entries` is indexed
 * by slot, with `undefined` for a slot whose agent is gone.
 */
export function attentionCandidates<A>(
  entries: readonly (AttentionEntry<A> | undefined)[],
): AttentionCandidate<A>[] {
  const found: AttentionCandidate<A>[] = [];
  entries.forEach((entry, slot) => {
    if (!entry || entry.selected) return;
    const kind = attentionKind(entry.state);
    if (kind) found.push({ agent: entry.agent, kind, slot });
  });
  return found.sort(
    (a, b) =>
      ATTENTION_RANK[a.kind] - ATTENTION_RANK[b.kind] || a.slot - b.slot,
  );
}
