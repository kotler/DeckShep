import type {
  AgentSnapshot,
  BackendCapability,
  TargetRef,
  ControlId,
} from '../../domain/types';
import type {
  BackendInfo,
  DeliveryPermit,
  InputAction,
  TerminalBackend,
} from '../../domain/backend';
import { validate } from '../../schemas';
export interface AppFixtureTransport {
  version(): Promise<string>;
  snapshot(): Promise<{
    agents: AgentSnapshot[];
    focused: AgentSnapshot | null;
  }>;
  dispose(): Promise<void>;
}
export const HERDR_APP_FIXTURE_VERSION = 'fixture:herdr-app:0.1.13';
/** No production transport is exported. Source inspection is insufficient proof
 * of native focus/identity, so even the known fixture has no input capabilities. */
export class HerdrAppBackend implements TerminalBackend {
  readonly id = 'herdr-app';
  generation = 0;
  #capabilities = new Set<BackendCapability>();
  #connected = false;
  get capabilities(): ReadonlySet<BackendCapability> {
    return new Set(this.#capabilities);
  }
  get verifiedControls(): ReadonlySet<ControlId> {
    return new Set();
  }
  readonly verificationKey = '';
  constructor(private readonly transport: AppFixtureTransport) {}
  async connect(signal: AbortSignal): Promise<BackendInfo> {
    this.#connected = false;
    this.#capabilities.clear();
    this.generation++;
    if (signal.aborted) throw Error('Connection cancelled');
    const version = await this.transport.version();
    if (signal.aborted) throw Error('Connection cancelled');
    if (version === HERDR_APP_FIXTURE_VERSION)
      this.#capabilities.add('discover');
    this.#connected = true;
    return {
      id: this.id,
      version: /^[A-Za-z0-9.:_-]{1,64}$/.test(version) ? version : 'unknown',
      capabilities: this.capabilities,
      verifiedControls: this.verifiedControls,
      verificationKey: this.verificationKey,
    };
  }
  private async snapshot() {
    if (!this.#connected || !this.#capabilities.has('discover'))
      throw Error('Herdr App version unverified');
    const snapshot = await this.transport.snapshot();
    validate('registry', snapshot);
    if (!Array.isArray(snapshot.agents) || snapshot.agents.length > 1000)
      throw Error('Invalid Herdr App snapshot');
    for (const agent of [
      ...snapshot.agents,
      ...(snapshot.focused ? [snapshot.focused] : []),
    ]) {
      if (
        !agent ||
        !Number.isSafeInteger(agent.pid) ||
        agent.pid <= 0 ||
        ![agent.block, agent.session, agent.app, agent.name].every(
          (value) =>
            typeof value === 'string' &&
            /^[^\x00-\x1f\x7f]{1,1024}$/.test(value),
        )
      )
        throw Error('Invalid Herdr App identity');
    }
    return structuredClone(snapshot);
  }
  async discover(): Promise<AgentSnapshot[]> {
    return (await this.snapshot()).agents;
  }
  async focused(): Promise<AgentSnapshot> {
    const agent = (await this.snapshot()).focused;
    if (!agent) throw Error('Native focus unavailable');
    return agent;
  }
  async focus(_target: TargetRef): Promise<void> {
    throw Error('Herdr App focus unverified');
  }
  async zoom(_target: TargetRef): Promise<void> {
    throw Error('Herdr App zoom unverified');
  }
  async deliver(
    _target: TargetRef,
    _input: InputAction,
    _guard: DeliveryPermit,
  ): Promise<never> {
    throw Error('Herdr App input disabled');
  }
  async dispose(): Promise<void> {
    this.#connected = false;
    this.#capabilities.clear();
    this.generation++;
    await this.transport.dispose();
  }
}
