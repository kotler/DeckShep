import type { AgentSnapshot, Config, TargetRef } from '../domain/types';
import type { PaneView } from '../domain/backend';
import type { DeliveryKernel } from './delivery';

/** A routed preview owns its settings and key contexts without inheriting any
 * Rex/TUI methods, native discovery or provider metadata readers. */
export class HerdrAppPreview {
  generation = 0;
  backendKey = '';
  agents: AgentSnapshot[] = [];
  slots: { session: string; block: string }[] = [];
  lastTarget: TargetRef | null = null;
  draft = null;
  picker = null;
  delivery: DeliveryKernel | null = null;
  constructor(public config: Config) {}
  attachDelivery(kernel: DeliveryKernel): void {
    this.delivery = kernel;
  }
  async discover(): Promise<AgentSnapshot[]> {
    return [];
  }
  async focused(): Promise<AgentSnapshot> {
    throw Error('Herdr App unverified');
  }
  async focus(_target: TargetRef): Promise<void> {
    throw Error('Herdr App unverified');
  }
  async zoom(): Promise<void> {
    throw Error('Herdr App unverified');
  }
  async readPane(_target: TargetRef): Promise<PaneView> {
    throw Error('Herdr App unverified');
  }
  async collapse(): Promise<{ removed: number }> {
    return { removed: 0 };
  }
}
