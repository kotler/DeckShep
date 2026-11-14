/** In-memory counterexamples only. No sockets, agents or production authority. */
import { DaemonControls } from '../../src/agents/codex/daemon';
import {
  cycleCodexSetting,
  type KeyboardPort,
} from '../../src/agents/codex/keyboard-settings';
import type { AgentSnapshot } from '../../src/domain/types';
import type { KeyboardView } from '../../src/domain/backend';
import { KeyboardScreen } from './keyboard-screen';

export interface ProbeModel {
  id: string;
  label: string;
  efforts: string[];
}
export const probeModels: ProbeModel[] = ['Alpha', 'Beta', 'Gamma'].map(
  (label) => ({ id: label.toLowerCase(), label, efforts: ['low', 'high'] }),
);

export async function nativeModelProbe(
  options: {
    footerless?: boolean;
    commandFooter?: boolean;
  } = {},
) {
  const screen = new KeyboardScreen();
  screen.models = probeModels.map((m) => m.label);
  screen.hideFooter = options.footerless ?? false;
  const write = async (_view: KeyboardView, key: string) => {
    screen.send(key);
    return screen.view();
  };
  const port: KeyboardPort = {
    read: async () => screen.view(),
    key: write,
    paste: async (view, command) => {
      const typed = await write(view, command);
      return options.commandFooter
        ? { ...typed, text: `› ${command}\n\n  100% context left` }
        : typed;
    },
  };
  await cycleCodexSetting(port, 'model');
  return {
    model: screen.models[screen.model],
    effort: screen.levels[screen.effort],
    trace: screen.trace,
  };
}

/** Run the real daemon cycle against a deliberately unconditional fake receiver.
 * It holds the mutation AFTER the client's last check, making the gap observable. */
export function daemonModelProbe(
  options: {
    models?: ProbeModel[];
    current?: string;
    held?: boolean;
  } = {},
) {
  const id = '01a1ae31-d050-7503-afec-fd2b40d2bc26';
  const agent: AgentSnapshot = {
    session: 'fixture',
    block: 'a',
    pid: 42,
    app: 'codex',
    name: 'Codex',
    state: 'idle',
    cwd: '/fixture',
  };
  const endpoint = { pid: 50, socket: '/fixture-only/not-a-socket' };
  let model = options.current ?? 'alpha';
  let focus = 'a',
    focusRevision = 0,
    authorized = true,
    clock = 10000;
  let effects = 0,
    release = () => {},
    received = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const accepted = new Promise<void>((resolve) => {
    received = resolve;
  });
  const current = () => ({
    id,
    model,
    reasoningEffort: 'high',
    cwd: '/fixture',
    status: { type: 'idle' },
  });
  const rpc = {
    async request(
      method: string,
      params: Record<string, unknown>,
      beforeWrite?: () => void,
    ) {
      if (method === 'thread/loaded/list') return { data: [id] };
      if (method === 'thread/read') return { thread: current() };
      if (method === 'model/list')
        return {
          data: (options.models ?? probeModels).map((m) => ({
            model: m.id,
            displayName: m.label,
            hidden: false,
            supportedReasoningEfforts: m.efforts.map((reasoningEffort) => ({
              reasoningEffort,
            })),
          })),
        };
      if (
        method !== 'thread/settings/update' ||
        typeof params.model !== 'string'
      )
        throw Error('Unexpected probe request');
      beforeWrite?.();
      received();
      if (options.held) await waiting;
      // Intentionally ignores focus, authorization and age. This is the gap.
      model = params.model;
      effects++;
      return {};
    },
    close() {},
  };
  const check = () => {
    if (focus !== 'a' || !authorized || clock >= 12000)
      throw Error('Probe client refused');
  };
  const bridge = {
    config: {},
    checked: async () => {
      check();
      return agent;
    },
    deliverMutation: async (
      _agent: AgentSnapshot,
      _method: string,
      operation: (beforeIO: () => void) => Promise<unknown>,
    ) => operation(check),
  };
  const control = new DaemonControls(bridge, {
    socketFor: async () => endpoint,
    footer: async () => id,
    connect: async () => rpc,
  });
  return {
    run: () => control.cycle(agent),
    accepted,
    release: () => release(),
    focus(next: string) {
      focus = next;
      focusRevision++;
    },
    invalidate() {
      authorized = false;
    },
    advance(ms: number) {
      clock += ms;
    },
    state: () => ({ model, effects, focus, focusRevision, authorized, clock }),
  };
}
