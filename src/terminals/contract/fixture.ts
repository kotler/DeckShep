import { GuardedBackend, type DeliveryAuthority } from './backend';
import type { AgentSnapshot, TargetRef } from '../../domain/types';
import type { InputAction } from '../../domain/backend';
import { backendCapabilities } from '../../domain/capabilities';
export interface FixtureScene { agents: AgentSnapshot[]; focused: string; calls: InputAction[]; timeout?: boolean }
export class FixtureBackend extends GuardedBackend {
  constructor(readonly scene: FixtureScene, authority: DeliveryAuthority) {
    super('rex', new Set(backendCapabilities.rex), {
      discover: async () => scene.agents.map(agent => ({ ...agent })),
      focused: async () => {
        const agent = scene.agents.find(agent => agent.block === scene.focused);
        if (!agent) throw Error('Native focus unavailable');
        return { ...agent };
      },
      readPane: async () => ({ text: 'fixture viewport' }),
      focus: async target => { scene.focused = target.block; },
      execute: async (target: TargetRef, input: InputAction) => {
        scene.calls.push(input);
        if (scene.timeout) throw Error('Fixture transport timeout');
        if (input.kind === 'focus') scene.focused = target.block;
      },
    }, authority, 'fixture-1');
  }
}
