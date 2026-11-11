import type { AgentSnapshot, TargetRef } from '../domain/types';
import { sameNavigationTarget } from '../domain/navigation';
const { snapshot } = require('../guards/context');

interface RexMetadataSession {
  navigationAgents?: AgentSnapshot[];
  agents?: AgentSnapshot[];
  lastTarget?: TargetRef | null;
  claude: {
    prune(agents: AgentSnapshot[]): void;
    enrich(agent: AgentSnapshot): Promise<AgentSnapshot>;
  };
}

/** Provider reads belong to row three, after Rex discovery is published. */
export async function refreshRexClaudeMetadata(
  source: RexMetadataSession,
  isCurrent: () => boolean,
): Promise<void> {
  const navigation = source.navigationAgents;
  if (!navigation) return;
  source.claude.prune(navigation);
  for (const raw of navigation) {
    if (raw.app !== 'claude-code') continue;
    let candidate: AgentSnapshot;
    try {
      candidate = await source.claude.enrich({ ...raw });
    } catch {
      candidate = {
        ...raw,
        nativeVerified: false,
        claudeControlsEnabled: false,
      };
    }
    if (!isCurrent() || source.navigationAgents !== navigation) return;
    const live = source.agents?.find((agent) =>
      sameNavigationTarget(raw, agent),
    );
    if (!live || live.cwd !== raw.cwd) continue;
    Object.assign(live, candidate);
    // A fresh selection can acquire provider proof, but cannot replace an
    // identity already captured by a press. enrich() still revokes root changes.
    if (
      candidate.nativeVerified &&
      sameNavigationTarget(source.lastTarget, live) &&
      !source.lastTarget?.nativeIdentity
    )
      source.lastTarget = snapshot(live);
  }
}

/** Provider observations may restrict the row or flag a pane for attention.
 * Native delivery still verifies the process, turn and visible control. */
export function rexDisplayAgent(agent: AgentSnapshot): AgentSnapshot {
  if (
    !agent.codexDisplayState ||
    agent.app !== 'codex' ||
    agent.activityStatusAt !== agent.statusAt ||
    agent.state === 'blocked'
  )
    return agent;
  if (agent.codexDisplayState === 'waiting')
    return { ...agent, state: 'blocked', kind: 'form', runId: null };
  return {
    ...agent,
    state: agent.codexDisplayState === 'error' ? 'error' : 'unknown',
    runId: null,
  };
}
