import type { DeliveryPermit, InputAction } from '../domain/backend';
import type { PressContext, TargetRef } from '../domain/types';

export interface CurrentPress {
  visible?: boolean;
  scope: string;
  appearance?: number;
  visibility: number;
  generation: number;
  backendKey: string;
  page: number;
  stamp: string;
}
const targetKey = (target: TargetRef) => JSON.stringify([
  target.session, target.block, target.pid, target.app, target.name,
  target.terminalId ?? null, target.chatId ?? null, target.nativeIdentity ?? null,
]);
const actions = new Set<InputAction['kind']>(['keys', 'paste', 'focus', 'selectWindow', 'zoom', 'providerMutation']);
interface Grant { context: PressContext; target: string; generation: number; used: boolean }

/** Every mutation consumes an unforgeable, single-use grant immediately before I/O. */
export class GuardPipeline {
  readonly #grants = new WeakMap<DeliveryPermit, Grant>();
  constructor(private readonly current: () => CurrentPress, private readonly now: () => number = Date.now) {}

  preflight(context: PressContext, contextual: boolean): void {
    this.assertVisible(context);
    const current = this.current();
    if (context.backendKey !== current.backendKey) throw Error('Controller changed; press again');
    if (context.setupBusy) throw Error('Setup finished; press again');
    if (!contextual) return;
    if (context.page !== current.page || context.stamp !== current.stamp) throw Error('Controls changed; press again');
    if ((context.pressedAt ?? this.now()) < context.armedAt) throw Error('Controls updating; press again');
    if (!context.target) throw Error('Select an agent first');
  }

  assertVisible(context: PressContext): void {
    const current = this.current();
    if (current.visible === false || context.scope !== current.scope || context.appearance !== current.appearance ||
        context.visibility !== current.visibility || context.generation !== current.generation) {
      throw Error('Profile changed; press again');
    }
  }

  issue(context: PressContext, target: TargetRef, generation: number): DeliveryPermit {
    this.assertVisible(context);
    if (context.backendKey !== this.current().backendKey || context.generation !== generation) throw Error('Controller changed; no input sent');
    const token = Object.freeze({}) as DeliveryPermit;
    this.#grants.set(token, { context, target: targetKey(target), generation, used: false });
    return token;
  }

  consume(token: DeliveryPermit, target: TargetRef, generation: number, input: InputAction): void {
    const grant = this.#grants.get(token);
    if (!grant || grant.used) throw Error('Input permit expired');
    // Consume before any transport call, including an uncertain write/timeout.
    grant.used = true;
    this.assertVisible(grant.context);
    if (grant.generation !== generation || grant.target !== targetKey(target) || grant.context.backendKey !== this.current().backendKey) throw Error('Input target changed');
    if (!actions.has(input.kind)) throw Error('Unsupported input action');
  }

  postflight(context: PressContext): void { this.assertVisible(context); }
}
