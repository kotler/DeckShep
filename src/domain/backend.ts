import type {
  AgentSnapshot,
  BackendCapability,
  BackendId,
  TargetRef,
  PressContext,
  ControlId,
} from './types';

declare const permitBrand: unique symbol;
/** A backend accepts only permits minted by its own authority, checked at runtime. */
export interface DeliveryPermit {
  readonly [permitBrand]: true;
}
export type InputAction = (
  | { kind: 'keys'; keys: readonly string[] }
  | { kind: 'paste'; text: string }
  | { kind: 'focus' }
  | { kind: 'selectWindow' }
  | { kind: 'zoom' }
  | { kind: 'providerMutation'; method: string }
) & { controlId?: ControlId; verificationKey?: string };
export interface ControlVerification {
  readonly key: string;
  readonly controls: ReadonlySet<ControlId>;
}
export interface BackendInfo {
  id: BackendId;
  version: string;
  capabilities: ReadonlySet<BackendCapability>;
  verifiedControls: ReadonlySet<ControlId>;
  verificationKey: string;
}
export interface PaneView {
  text: string;
  hash?: string;
  cursor?: { row: number; column: number } | null;
}
export interface TerminalBackend {
  readonly id: BackendId;
  readonly generation: number;
  readonly capabilities: ReadonlySet<BackendCapability>;
  readonly verifiedControls: ReadonlySet<ControlId>;
  readonly verificationKey: string;
  connect(signal: AbortSignal): Promise<BackendInfo>;
  discover(): Promise<AgentSnapshot[]>;
  focused(): Promise<AgentSnapshot>;
  focus(target: TargetRef): Promise<void>;
  deliver(
    target: TargetRef,
    input: InputAction,
    guard: DeliveryPermit,
  ): Promise<unknown>;
  readPane?(target: TargetRef): Promise<PaneView>;
  zoom?(target: TargetRef): Promise<void>;
  dispose(): Promise<void>;
}
export interface ProviderOperations {
  execute(action: string, context: PressContext): Promise<unknown>;
}
export interface ProviderContext {
  press: PressContext;
  operations: ProviderOperations;
  backend: TerminalBackend;
}
export interface AgentProvider {
  readonly id: 'codex' | 'claude-code';
  matches(process: { app?: string }): boolean;
  bind(
    agent: AgentSnapshot,
    backend: TerminalBackend,
  ): Promise<AgentSnapshot | null>;
  state(binding: AgentSnapshot): Promise<AgentSnapshot>;
  controls(state: AgentSnapshot): readonly import('./types').ControlSpec[];
  perform(control: string, context: ProviderContext): Promise<unknown>;
}
