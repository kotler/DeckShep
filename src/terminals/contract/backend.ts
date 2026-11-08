import type {
  AgentSnapshot,
  BackendCapability,
  BackendId,
  TargetRef,
  ControlId,
} from '../../domain/types';
import type {
  BackendInfo,
  DeliveryPermit,
  InputAction,
  TerminalBackend,
  PaneView,
  ControlVerification,
} from '../../domain/backend';
import {
  knownControls,
  controlSpec,
  supported,
} from '../../domain/capabilities';
import { assertVerifiedInput } from '../../guards/verified-control';
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
  #verification: ControlVerification;
  constructor(
    readonly id: BackendId,
    readonly capabilities: ReadonlySet<BackendCapability>,
    private readonly driver: BackendDriver,
    private readonly authority: DeliveryAuthority,
    private readonly version: string,
    verification?: ControlVerification,
  ) {
    this.#verification = verification
      ? { key: verification.key, controls: new Set(verification.controls) }
      : {
          key: id === 'herdr-app' ? '' : version,
          controls: new Set(
            id === 'herdr-app'
              ? []
              : knownControls.filter((control) =>
                  supported(controlSpec(control), capabilities),
                ),
          ),
        };
  }
  get verifiedControls(): ReadonlySet<ControlId> {
    return new Set(this.#verification.controls);
  }
  get verificationKey(): string {
    return this.#verification.key;
  }
  protected replaceVerification(record: ControlVerification): void {
    this.#verification = {
      key: record.key,
      controls: new Set(record.controls),
    };
    this.generation++;
  }
  async connect(signal: AbortSignal): Promise<BackendInfo> {
    if (signal.aborted) throw Error('Connection cancelled');
    this.#disposed = false;
    this.generation++;
    return {
      id: this.id,
      version: this.version,
      capabilities: this.capabilities,
      verifiedControls: this.verifiedControls,
      verificationKey: this.verificationKey,
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
    await this.deliver(
      target,
      this.id === 'herdr-app'
        ? {
            kind: 'focus',
            controlId: 'focus',
            verificationKey: this.verificationKey,
          }
        : { kind: 'focus' },
      this.authority.issue(target),
    );
  }
  async zoom(target: TargetRef): Promise<void> {
    await this.deliver(
      target,
      this.id === 'herdr-app'
        ? {
            kind: 'zoom',
            controlId: 'zoom',
            verificationKey: this.verificationKey,
          }
        : { kind: 'zoom' },
      this.authority.issue(target),
    );
  }
  async deliver(
    target: TargetRef,
    input: InputAction,
    token: DeliveryPermit,
  ): Promise<unknown> {
    this.assertConnected();
    this.authority.consume(token, target, this.generation, input);
    assertVerifiedInput(this, input);
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
