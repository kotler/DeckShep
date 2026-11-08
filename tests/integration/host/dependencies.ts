// This module is substituted only by the host test's private Rollup build.
const { Bridge } = require('../../../src/app/session');
const C = require('../../../src/guards/context');
class FixtureSession extends Bridge {
  constructor(config: Record<string, unknown>) {
    super(config, async (args: string[]) => { process.send?.({ kind: 'fixtureInput', args }); });
  }
  async discover() {
    this.agents = ['a', 'b'].map((block, index) => ({ session: 'fixture', window: 'window', block, pid: 4200 + index, app: 'codex', name: 'codex', state: 'idle', chatId: 'chat-' + block, statusAt: 'fixture', project: 'fixture' }));
    this.slots = this.agents.map((agent: any) => ({ session: agent.session, block: agent.block }));
    return this.agents;
  }
  async focused() {
    const agent = this.agents.find((agent: any) => agent.block === this.lastTarget?.block) ?? this.agents[0];
    if (this.actionContext) C.assertContext(this.actionContext, agent);
    return agent;
  }
  async focus(target: any) {
    await this.run(['focus', '--session', target.session, target.block], undefined, target);
    this.lastTarget = target;
  }
}
export function applicationDependencies() {
  return { backendFactory: (config: Record<string, unknown>) => new FixtureSession(config), metadataFactory: () => ({ hydrate() {}, async refresh(agents: unknown[]) { return agents; } }) };
}
