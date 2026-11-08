import type {
  AgentProvider,
  ProviderContext,
  TerminalBackend,
} from '../../domain/backend';
import type {
  AgentSnapshot,
  ControlId,
  ControlSpec,
  ProviderId,
} from '../../domain/types';
import { controlSpec, supported } from '../../domain/capabilities';

export class SessionProvider implements AgentProvider {
  constructor(readonly id: ProviderId) {}
  matches(process: { app?: string }): boolean {
    return process.app === this.id;
  }
  async bind(
    agent: AgentSnapshot,
    _backend: TerminalBackend,
  ): Promise<AgentSnapshot | null> {
    return this.matches(agent) ? agent : null;
  }
  async state(binding: AgentSnapshot): Promise<AgentSnapshot> {
    return binding;
  }
  controls(_state: AgentSnapshot): readonly ControlSpec[] {
    return (
      [
        'model',
        'effort',
        'zoom',
        'interrupt',
        'up',
        'down',
        'left',
        'right',
        'answer',
        'escape',
        'review',
        'tests',
        'continue',
        'send',
        'steer',
        'queue',
      ] as ControlId[]
    ).map(controlSpec);
  }
  async perform(control: string, context: ProviderContext): Promise<unknown> {
    const spec = this.controls(context.press.target!).find(
      (item) => item.id === control,
    );
    // The native implementation retains its precise refusal messages and all
    // identity/version/state checks, including legacy per-key overrides.
    if (
      spec &&
      !supported(spec, context.backend.capabilities) &&
      context.backend.id === 'herdr-app'
    )
      throw Error('Use keyboard');
    return context.operations.execute(control, context.press);
  }
}
