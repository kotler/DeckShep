type AgentSnapshot = import('../domain/types').AgentSnapshot;
type Config = import('../domain/types').Config;
type PressContext = import('../domain/types').PressContext;
('use strict');
const { sameTarget } = require('../domain/labels');
class CompletionDisplay {
  declare dwellMs: any;
  declare entries: Map<any, any>;
  constructor(dwellMs: any = 2000) {
    this.dwellMs = dwellMs;
    this.entries = new Map();
  }
  key(agent: import('../domain/types').AgentSnapshot) {
    return JSON.stringify([
      agent.session,
      agent.block,
      agent.app,
      agent.pid,
      agent.nativeIdentity || null,
    ]);
  }
  update(
    agents: import('../domain/types').AgentSnapshot[],
    selected: any,
    now: number,
  ) {
    const live: Set<any> = new Set();
    for (const agent of agents) {
      const key: string = this.key(agent);
      live.add(key);
      if (agent.state !== 'done') {
        this.entries.delete(key);
        continue;
      }
      let entry: any = this.entries.get(key);
      if (!entry || entry.statusAt !== agent.statusAt) {
        entry = { statusAt: agent.statusAt, since: null, acknowledged: false };
        this.entries.set(key, entry);
      }
      if (!entry.acknowledged) {
        if (sameTarget(agent, selected)) {
          entry.since ??= now;
          if (now - entry.since >= this.dwellMs) entry.acknowledged = true;
        } else entry.since = null;
      }
    }
    for (const key of this.entries.keys())
      if (!live.has(key)) this.entries.delete(key);
  }
  agent(
    agent: import('../domain/types').AgentSnapshot,
  ): import('../domain/types').AgentSnapshot {
    return agent.state === 'done' &&
      this.entries.get(this.key(agent))?.acknowledged
      ? { ...agent, state: 'idle' }
      : agent;
  }
}
module.exports = { CompletionDisplay };

export { CompletionDisplay };
