import { isRexRead } from '../domain/transport';
import { GuardPipeline } from '../guards/pipeline';
import { RexBackend } from '../terminals/rex/backend';
import { HerdrTuiBackend } from '../terminals/herdr-tui/backend';
import type { InputAction, TerminalBackend } from '../domain/backend';
import { assertVerifiedControl } from '../guards/verified-control';
import type {
  BackendDriver,
  DeliveryAuthority,
} from '../terminals/contract/backend';
import type {
  AgentSnapshot,
  BackendId,
  PressContext,
  TargetRef,
} from '../domain/types';

interface SessionPort {
  generation: number;
  config: {
    backend: string;
    allowClipboardFocus?: boolean;
    claude?: { enabled?: boolean };
    herdr?: { titleIdentity?: boolean };
  };
  agents?: AgentSnapshot[];
  lastTarget?: TargetRef | null;
  actionContext?: { target?: AgentSnapshot } | null;
  discover(): Promise<AgentSnapshot[]>;
  focused(): Promise<AgentSnapshot>;
  focus(target: TargetRef): Promise<void>;
  zoom(): Promise<void>;
  readPane(target: TargetRef): Promise<import('../domain/backend').PaneView>;
}
const herdrReads = new Set([
  'session.snapshot',
  'agent.get',
  'pane.process_info',
  'pane.get',
  'agent.read',
]);

/** Legacy command adapters terminate here. Unknown commands are denied, never
 * treated as reads; every existing native check still runs before this gate. */
export class DeliveryKernel {
  readonly backend: TerminalBackend;
  readonly #operations = new WeakMap<InputAction, () => Promise<unknown>>();
  constructor(
    private readonly session: SessionPort,
    private readonly guards: GuardPipeline,
    private readonly active: () => PressContext | null,
    createBackend?: (
      driver: BackendDriver,
      authority: DeliveryAuthority,
    ) => TerminalBackend,
  ) {
    const driver: BackendDriver = {
      discover: () => session.discover(),
      focused: () => session.focused(),
      focus: (target) => session.focus(target),
      readPane: (target) => session.readPane(target),
      execute: async (target, input) => {
        const operation = this.#operations.get(input);
        this.#operations.delete(input);
        if (operation) return operation();
        if (input.kind === 'focus') return session.focus(target);
        if (input.kind === 'zoom') return session.zoom();
        throw Error('Input operation unavailable');
      },
    };
    const authority: DeliveryAuthority = {
      consume: (permit, target, generation, input) =>
        guards.consume(permit, target, generation, input),
      issue: (target) =>
        guards.issue(this.context(), target, this.backend.generation),
    };
    if (createBackend) {
      this.backend = createBackend(driver, authority);
      return;
    }
    if (!['rex', 'herdr'].includes(session.config.backend))
      throw Error('Backend unavailable');
    const id: BackendId =
      session.config.backend === 'herdr' ? 'herdr-tui' : 'rex';
    const Backend = id === 'herdr-tui' ? HerdrTuiBackend : RexBackend;
    const legacy = new Backend(driver, authority);
    this.backend = legacy;
    void legacy.connect(new AbortController().signal);
    legacy.generation = session.generation;
  }
  private context(): PressContext {
    const context = this.active();
    if (!context) throw Error('No guarded press; no input sent');
    return context;
  }
  assertVisible(): void {
    const context = this.active();
    if (context) this.guards.assertVisible(context);
  }
  private target(
    session?: string,
    block?: string,
    explicit?: TargetRef,
  ): TargetRef {
    const target =
      explicit ??
      (session || block
        ? this.session.agents?.find(
            (agent) =>
              (!session || agent.session === session) &&
              (!block || agent.block === block),
          )
        : undefined) ??
      this.session.actionContext?.target ??
      this.session.lastTarget;
    if (
      !target ||
      (session && target.session !== session) ||
      (block && target.block !== block)
    )
      throw Error('Input target changed');
    return target;
  }
  private async deliver(
    target: TargetRef,
    input: InputAction,
    operation: (beforeIO: () => void) => Promise<unknown>,
  ): Promise<unknown> {
    const context = this.context();
    assertVerifiedControl(this.backend, context);
    if (this.backend.id === 'herdr-app')
      input = {
        ...input,
        controlId: context.controlId,
        verificationKey: context.verificationKey,
      };
    const permit = this.guards.issue(context, target, this.backend.generation);
    const beforeIO = () => {
      assertVerifiedControl(this.backend, context);
      this.guards.preflight(context, false);
      if (this.backend.generation !== context.generation)
        throw Error('Controller changed; no input sent');
      if (['keys', 'paste', 'providerMutation'].includes(input.kind)) {
        if (
          this.session.config.backend === 'rex' &&
          this.session.config.allowClipboardFocus !== true
        )
          throw Error('Enable visible-pane checks first');
        if (
          target.app === 'claude-code' &&
          this.session.config.claude?.enabled !== true
        )
          throw Error('Enable Claude controls first');
        if (
          this.session.config.backend === 'herdr' &&
          target.app === 'codex' &&
          this.session.config.herdr?.titleIdentity !== true
        )
          throw Error('Enable title identity first');
      }
    };
    this.#operations.set(input, () => {
      beforeIO();
      return operation(beforeIO);
    });
    try {
      return await this.backend.deliver(target, input, permit);
    } finally {
      this.#operations.delete(input);
    }
  }
  async run(
    args: string[],
    input: string | undefined,
    operation: (beforeIO: () => void) => Promise<unknown>,
    explicit?: TargetRef,
  ): Promise<unknown> {
    if (isRexRead(args)) return operation(() => {});
    if (args[0] === '-C' && args[2] === 'do' && args[3] === 'session.select')
      return this.deliver(
        this.target(undefined, undefined, explicit),
        { kind: 'selectWindow' },
        operation,
      );
    if (args[0] === 'send' || args[0] === 'send-key') {
      const target = this.target(args[2], args[4], explicit);
      return this.deliver(
        target,
        args[0] === 'send'
          ? { kind: 'paste', text: input ?? '' }
          : { kind: 'keys', keys: args.slice(5) },
        operation,
      );
    }
    if (args[0] === 'focus' || args[0] === 'zoom')
      return this.deliver(
        this.target(args[2], args[3], explicit),
        { kind: args[0] },
        operation,
      );
    return Promise.reject(Error('Unsupported terminal command'));
  }
  async rpc(
    method: string,
    params: Record<string, unknown>,
    operation: (beforeIO: () => void) => Promise<unknown>,
  ): Promise<unknown> {
    if (herdrReads.has(method)) return operation(() => {});
    const target = this.target(
      undefined,
      String(params.target ?? params.pane_id ?? ''),
    );
    if (method === 'agent.send_keys')
      return this.deliver(
        target,
        { kind: 'keys', keys: params.keys as string[] },
        operation,
      );
    if (method === 'agent.focus')
      return this.deliver(target, { kind: 'focus' }, operation);
    if (method === 'pane.zoom')
      return this.deliver(target, { kind: 'zoom' }, operation);
    return Promise.reject(Error('Unsupported terminal request'));
  }
  activation(
    target: TargetRef,
    operation: (beforeIO: () => void) => Promise<unknown>,
  ): Promise<unknown> {
    return this.deliver(target, { kind: 'focus' }, operation);
  }
  mutation(
    target: TargetRef,
    method: string,
    operation: (beforeIO: () => void) => Promise<unknown>,
  ): Promise<unknown> {
    return this.deliver(
      target,
      { kind: 'providerMutation', method },
      operation,
    );
  }
}
