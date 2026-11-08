import type {
  AgentSnapshot,
  BackendCapability,
  BackendId,
  TargetRef,
} from '../../domain/types';
import type {
  BackendInfo,
  DeliveryPermit,
  InputAction,
  TerminalBackend,
  PaneView,
} from '../../domain/backend';
export interface BackendDriver {
  discover(): Promise<AgentSnapshot[]>;
  focused(): Promise<AgentSnapshot>;
  focus(target: TargetRef): Promise<void>;
  execute(target: TargetRef, input: InputAction): Promise<unknown>;
  dispose?(): Promise<void>;
  readPane?(target: TargetRef): Promise<PaneView>;
}
export interface DeliveryAuthority {
  consume(
    permit: DeliveryPermit,
    target: TargetRef,
    generation: number,
    input: InputAction,
  ): void;
  issue(target: TargetRef): DeliveryPermit;
}
export class GuardedBackend implements TerminalBackend {
  generation = 0;
  #disposed = false;
  constructor(
    readonly id: BackendId,
    readonly capabilities: ReadonlySet<BackendCapability>,
    private readonly driver: BackendDriver,
    private readonly authority: DeliveryAuthority,
    private readonly version: string,
  ) {}
  async connect(signal: AbortSignal): Promise<BackendInfo> {
    if (signal.aborted) throw Error('Connection cancelled');
    this.#disposed = false;
    this.generation++;
    return {
      id: this.id,
      version: this.version,
      capabilities: this.capabilities,
    };
  }
  async discover(): Promise<AgentSnapshot[]> {
    this.assertConnected();
    return this.driver.discover();
  }
  async focused(): Promise<AgentSnapshot> {
    this.assertConnected();
    return this.driver.focused();
  }
  async readPane(target: TargetRef): Promise<PaneView> {
    this.assertConnected();
    if (!this.capabilities.has('readPane') || !this.driver.readPane)
      throw Error('Pane reads unavailable');
    const generation = this.generation,
      result = await this.driver.readPane(target);
    this.assertConnected();
    if (generation !== this.generation)
      throw Error('Backend changed while reading');
    return result;
  }
  async focus(target: TargetRef): Promise<void> {
    await this.deliver(target, { kind: 'focus' }, this.authority.issue(target));
  }
  async zoom(target: TargetRef): Promise<void> {
    await this.deliver(target, { kind: 'zoom' }, this.authority.issue(target));
  }
  async deliver(
    target: TargetRef,
    input: InputAction,
    token: DeliveryPermit,
  ): Promise<unknown> {
    this.assertConnected();
    this.authority.consume(token, target, this.generation, input);
    return this.driver.execute(target, input);
  }
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.generation++;
    await this.driver.dispose?.();
  }
  private assertConnected(): void {
    if (this.#disposed || !this.generation) throw Error('Backend disconnected');
  }
}
