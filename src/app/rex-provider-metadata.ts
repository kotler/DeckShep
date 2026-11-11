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
