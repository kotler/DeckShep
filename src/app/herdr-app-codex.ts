import type { Config } from '../domain/types';
import type { AppCoreProcess } from '../terminals/herdr-app/core-status';

const { DaemonControls } = require('../agents/codex/daemon');
const { TitleIdentity } = require('../agents/codex/title-identity');

export type AppControlKind = 'model' | 'effort' | 'permissions';
export interface AppCoreTerminalPort {
  terminal(address: string): Promise<AppCoreProcess>;
}
interface Binding {
  agent: {
    app: 'codex';
    session: 'herdr-app';
    block: string;
    pid: number;
    cwd: string;
    chatId: string;
    nativeIdentity: string;
  };
}
interface Dependencies {
  config(): Config;
  identity?: { resolve(agent: unknown, title: string): Promise<any> };
  daemon?: (bridge: unknown, deps: unknown) => any;
}
const SETTINGS = 'thread/settings/update';

/**
 * Daemon-only Codex controls for Herdr App panes (owner amendment 2026-11-08).
 * Nothing here types into a terminal. The core supplies the candidate PID,
 * cwd and title; the existing Herdr TUI title-identity recipe then requires a
 * fresh daemon socket for that PID and exactly one loaded root chat with the
 * same cwd. Every DaemonControls re-check re-runs that binding from scratch,
 * and the press guard runs immediately before the single permitted write.
 */
export class AppCodexControls {
  constructor(private readonly deps: Dependencies) {}
  async run(
    kind: AppControlKind,
    core: AppCoreTerminalPort,
    address: string,
    guard: () => void,
  ): Promise<{ kind: string; label: string }> {
    const identity = this.deps.identity ?? new TitleIdentity();
    const bind = async (): Promise<Binding> => {
      const terminal = await core.terminal(address);
      const candidate = {
        app: 'codex' as const,
        session: 'herdr-app' as const,
        block: address,
        pid: terminal.pid,
        cwd: terminal.cwd,
      };
      const resolved = await identity.resolve(candidate, terminal.title);
      return {
        agent: {
          ...candidate,
          chatId: resolved.chatId,
          nativeIdentity: resolved.nativeIdentity,
        },
      };
    };
    const first = await bind();
    const same = (next: Binding) =>
      (['pid', 'cwd', 'chatId', 'nativeIdentity'] as const).every(
        (field) => next.agent[field] === first.agent[field],
      );
    let used = false;
    const bridge = {
      backend: 'herdr-app',
      config: this.deps.config(),
      async checked(agent: unknown) {
        if (!same(await bind())) throw Error('Pane, chat or daemon changed');
        return agent;
      },
      // One press, one settings write: no retry, no second mutation.
      async deliverMutation(
        _agent: unknown,
        method: string,
        operation: (beforeWrite: () => void) => Promise<unknown>,
      ) {
        if (method !== SETTINGS || used)
          throw Error('No guarded press; no input sent');
        used = true;
        return operation(guard);
      },
    };
    const footer = async () => {
      const next = await bind();
      if (!same(next)) throw Error('Pane, chat or daemon changed');
      return next.agent.chatId;
    };
    const controls = this.deps.daemon
      ? this.deps.daemon(bridge, { footer })
      : new DaemonControls(bridge, { footer });
    if (kind === 'effort') return controls.cycleEffort(first.agent);
    if (kind === 'model') return controls.cycle(first.agent);
    return controls.cyclePermissions(first.agent);
  }
}
