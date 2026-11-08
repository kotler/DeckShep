import { GuardPipeline } from '../guards/pipeline';
import { GuardedBackend } from '../terminals/contract/backend';
import { RexBackend } from '../terminals/rex/backend';
import { HerdrTuiBackend } from '../terminals/herdr-tui/backend';
import type { InputAction } from '../domain/backend';
import type { AgentSnapshot, BackendId, PressContext, TargetRef } from '../domain/types';

interface SessionPort {
  generation: number;
  config: { backend: string };
  agents?: AgentSnapshot[];
  lastTarget?: TargetRef | null;
  actionContext?: { target?: AgentSnapshot } | null;
  discover(): Promise<AgentSnapshot[]>;
  focused(): Promise<AgentSnapshot>;
  focus(target: TargetRef): Promise<void>;
  zoom(): Promise<void>;
}
const rexReads = new Set(['process', 'program_status', 'modes', 'size', 'format']);
const herdrReads = new Set(['session.snapshot', 'agent.get', 'pane.process_info', 'pane.get', 'agent.read']);

/** Legacy command adapters terminate here. Unknown commands are denied, never
 * treated as reads; every existing native check still runs before this gate. */
export class DeliveryKernel {
  readonly backend: GuardedBackend;
  readonly #operations = new WeakMap<InputAction, () => Promise<unknown>>();
  constructor(private readonly session: SessionPort, private readonly guards: GuardPipeline,
    private readonly active: () => PressContext | null) {
    const id: BackendId = session.config.backend === 'herdr' ? 'herdr-tui' : 'rex';
    const Backend = id === 'herdr-tui' ? HerdrTuiBackend : RexBackend;
    this.backend = new Backend({
      discover: () => session.discover(), focused: () => session.focused(), focus: target => session.focus(target),
      execute: async (target, input) => {
        const operation = this.#operations.get(input);
        this.#operations.delete(input);
        if (operation) return operation();
        if (input.kind === 'focus') return session.focus(target);
        if (input.kind === 'zoom') return session.zoom();
        throw Error('Input operation unavailable');
      },
    }, {
      consume: (permit, target, generation, input) => guards.consume(permit, target, generation, input),
      issue: target => guards.issue(this.context(), target, this.backend.generation),
    });
    void this.backend.connect(new AbortController().signal);
    this.backend.generation = session.generation;
  }
  private context(): PressContext {
    const context = this.active();
    if (!context) throw Error('No guarded press; no input sent');
    return context;
  }
  assertVisible(): void { const context = this.active(); if (context) this.guards.assertVisible(context); }
  private target(session?: string, block?: string, explicit?: TargetRef): TargetRef {
    const target = explicit ?? ((session || block) ? this.session.agents?.find(agent => (!session || agent.session === session) && (!block || agent.block === block)) : undefined)
      ?? this.session.actionContext?.target ?? this.session.lastTarget;
    if (!target || session && target.session !== session || block && target.block !== block) throw Error('Input target changed');
    return target;
  }
  private async deliver(target: TargetRef, input: InputAction, operation: () => Promise<unknown>): Promise<unknown> {
    const permit = this.guards.issue(this.context(), target, this.backend.generation);
    this.#operations.set(input, operation);
    try { return await this.backend.deliver(target, input, permit); }
    finally { this.#operations.delete(input); }
  }
  async run(args: string[], input: string | undefined, operation: () => Promise<unknown>, explicit?: TargetRef): Promise<unknown> {
    if (args[0] === 'client' && args[1] === 'ls' && args[2] === '--json' && args.length === 3 || args[0] === 'ls' && args[1] === '--json' && args.length === 2 || args[0] === 'session' && args[1] === 'inspect' && args[3] === '--json' && args.length === 4 ||
        args[0] === 'block' && args[1] === 'call' && rexReads.has(args[6] ?? '')) return operation();
    if (args[0] === '-C' && args[2] === 'do' && args[3] === 'session.select') return this.deliver(this.target(undefined, undefined, explicit), { kind: 'selectWindow' }, operation);
    if (args[0] === 'send' || args[0] === 'send-key') {
      const target = this.target(args[2], args[4], explicit);
      return this.deliver(target, args[0] === 'send' ? { kind: 'paste', text: input ?? '' } : { kind: 'keys', keys: args.slice(5) }, operation);
    }
    if (args[0] === 'focus' || args[0] === 'zoom') return this.deliver(this.target(args[2], args[3], explicit), { kind: args[0] }, operation);
    return Promise.reject(Error('Unsupported terminal command'));
  }
  async rpc(method: string, params: Record<string, unknown>, operation: () => Promise<unknown>): Promise<unknown> {
    if (herdrReads.has(method)) return operation();
    const target = this.target(undefined, String(params.target ?? params.pane_id ?? ''));
    if (method === 'agent.send_keys') return this.deliver(target, { kind: 'keys', keys: params.keys as string[] }, operation);
    if (method === 'agent.focus') return this.deliver(target, { kind: 'focus' }, operation);
    if (method === 'pane.zoom') return this.deliver(target, { kind: 'zoom' }, operation);
    return Promise.reject(Error('Unsupported terminal request'));
  }
  activation(target: TargetRef, operation: () => Promise<unknown>): Promise<unknown> {
    return this.deliver(target, { kind: 'focus' }, operation);
  }
  mutation(target: TargetRef, method: string, operation: () => Promise<unknown>): Promise<unknown> {
    return this.deliver(target, { kind: 'providerMutation', method }, operation);
  }
}
