// Rollup-only substitution. No production runtime flag can load this module.
import { setImmediate as nextTurn } from 'node:timers/promises';
import type {
  AgentSnapshot,
  Config,
  TargetRef,
} from '../../../src/domain/types';
import { scenario, type Scenario, type ScenarioName } from './scenarios';
import { ClaudeKeyboardScreen } from '../../helpers/claude-keyboard-screen';
import { KeyboardScreen } from '../../helpers/keyboard-screen';
import { virtualAppFocus } from './app-focus';
const { Bridge } = require('../../../src/app/session');
const C = require('../../../src/guards/context');
let current = scenario('idle-two-codex');
let revision = 0;
let keyboard: KeyboardScreen | ClaudeKeyboardScreen = new KeyboardScreen();
let clock = 10000;
const timers: { callback: () => void; period: number; next: number }[] = [];
let pauseNext = false;
let releaseFocus: (() => void) | undefined;

class ScenarioSession extends Bridge {
  private seen = -1;
  constructor(config: Config) {
    super(
      config,
      async (args: string[], input?: string) => {
        if (!['focus', 'send-key', 'zoom', 'send'].includes(args[0]))
          throw Error('Unexpected fixture transport');
        if (current.keyboard && ['send', 'send-key'].includes(args[0])) {
          if (args[4] !== current.focused) throw Error('Wrong fixture pane');
          keyboard.send(
            args[0] === 'send' ? String(input).slice(6, -6) : args[5],
          );
        }
        process.send?.({
          kind: 'fixtureInput',
          args,
          ...(input === undefined ? {} : { input }),
        });
      },
      () => {
        throw Error('Fixture activation unavailable');
      },
      () => {
        throw Error('Fixture visible read unavailable');
      },
    );
    this.inspectClaudeKeyboard = async () => {
      if (!(keyboard instanceof ClaudeKeyboardScreen))
        throw Error('Fixture unavailable');
      return 'fixture-claude-process';
    };
    this.inspectKeyboardProcess = async (pid: number) => ({
      pid,
      codex: true,
      startedAt: '1.000001',
      image: 'a'.repeat(64),
    });
    this.readKeyboardView = async () => {
      if (!current.keyboard) throw Error('Fixture screen unavailable');
      return keyboard.view();
    };
    this.readComposer = async () => ({
      chatId: 'chat-' + current.focused,
      hash: 'fixture-draft',
      cursor: { row: 2, column: 9 },
    });
    this.readRequest = async () => 'fixture-request';
    this.verifyRunning = async () => ({});
  }
  private normalize(a: AgentSnapshot): AgentSnapshot {
    return {
      ...structuredClone(a),
      ...(a.app === 'claude-code'
        ? { claudeControlsEnabled: this.config.claude?.enabled === true }
        : {}),
      ...(this.config.backend === 'herdr'
        ? {
            session: 'herdr:fixture',
            terminalId: 'terminal-' + a.block,
            backend: 'herdr',
            composerSupported: false,
          }
        : {}),
    };
  }
  async discover(): Promise<AgentSnapshot[]> {
    if (current.offline) throw Error('Fixture offline');
    this.agents = current.agents.map((a) => this.normalize(a));
    if (this.seen !== revision) {
      this.seen = revision;
      this.slots = (current.slots ?? current.agents).map((s) => ({
        session: this.config.backend === 'herdr' ? 'herdr:fixture' : s.session,
        block: s.block,
      }));
    }
    return this.agents;
  }
  async agent(target: TargetRef): Promise<AgentSnapshot | null> {
    const found = current.agents.find((a) => a.block === target.block);
    return found ? this.normalize(found) : null;
  }
  async displayedAgent() {
    return this.focused();
  }
  async focused(): Promise<AgentSnapshot> {
    if (pauseNext) {
      pauseNext = false;
      await new Promise<void>((resolve) => {
        releaseFocus = resolve;
        process.send?.({ kind: 'fixturePaused' });
      });
    }
    const found = current.agents.find((a) => a.block === current.focused);
    if (current.offline || !found) throw Error('No fixture agent');
    const agent = this.normalize(found);
    this.assertDeliveryVisible();
    if (this.actionContext) {
      C.assertContext(this.actionContext, agent);
      if (this.actionContext.verifyChat && !this.actionContext.target.chatId)
        throw Error('Chat metadata loading; try again');
      if (
        this.actionContext.target.codexHookEpoch &&
        this.actionContext.target.codexHookEpoch !== agent.codexHookEpoch
      )
        throw Error('Codex hook changed; reselect');
      if (
        this.actionContext.verifyChat &&
        this.actionContext.target.chatId !== agent.chatId
      )
        throw Error('Selected chat changed');
    }
    this.lastTarget = { ...agent };
    return agent;
  }
  async focus(target: TargetRef): Promise<void> {
    const found = await this.agent(target);
    if (!found || found.pid !== target.pid)
      throw Error('Agent process changed');
    await this.run(
      ['focus', '--session', target.session, target.block],
      undefined,
      target,
    );
    current.focused = target.block;
    this.lastTarget = { ...found };
    this.draft = null;
    this.picker = null;
  }
  // Unsupported fixture operations fail closed instead of constructing any
  // daemon, process-inspection or native pane reader on the developer's machine.
  async method(_target: TargetRef, method: string) {
    if (current.keyboard && method === 'modes')
      return { modes: [{ number: 2004, set: true }] };
    throw Error('Fixture read unavailable');
  }
  async client(): Promise<never> {
    throw Error('Fixture client unavailable');
  }
  async cycleControl(): Promise<never> {
    throw Error('Fixture cycle unavailable');
  }
  async stopTerminals(): Promise<never> {
    throw Error('Fixture stop unavailable');
  }
  async stage(): Promise<never> {
    throw Error('Fixture prompt unavailable');
  }
}
async function command(message: Record<string, unknown>): Promise<void> {
  try {
    if (message.command === 'scenario') {
      current = scenario(message.value as ScenarioName | Scenario);
      revision++;
      keyboard = new KeyboardScreen();
      keyboard.showShortcutRow = current.keyboard === true;
      if (current.keyboard && current.agents[0]?.app === 'claude-code')
        keyboard = new ClaudeKeyboardScreen();
      else if (current.keyboard && current.agents[0]?.state === 'working')
        keyboard.surface = 'working';
      for (const timer of timers) if (timer.period === 2000) timer.callback();
    } else if (message.command === 'advance') {
      const amount = Number(message.value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 86400000)
        throw Error('Invalid fixture time');
      clock += amount;
      for (const timer of timers)
        if (timer.period === 250 || timer.next <= clock) {
          timer.next = clock + timer.period;
          timer.callback();
        }
    } else if (message.command === 'pauseFocus') pauseNext = true;
    else if (message.command === 'releaseFocus') {
      releaseFocus?.();
      releaseFocus = undefined;
    } else if (message.command !== 'barrier')
      throw Error('Unknown fixture command');
    // All fixture I/O is in-memory. Drain its promise continuations, including
    // refreshMetadata/render, before acknowledging; no wall-clock sleep.
    await nextTurn();
    process.send?.({ kind: 'fixtureAck', id: message.id, clock });
  } catch {
    process.send?.({
      kind: 'fixtureAck',
      id: message.id,
      error: 'Fixture command refused',
    });
  }
}
export function applicationDependencies() {
  // Bridge's legacy duplicate-submit timestamps share this child-only clock.
  Date.now = () => clock;
  process.on('message', (message: unknown) => {
    if (message && typeof message === 'object' && !Array.isArray(message))
      void command(message as Record<string, unknown>);
  });
  return {
    experimentalHerdrApp: true,
    diagnostics: async () => [
      { id: 'rex-api', ok: true, reason: 'Fixture server API 23 (minimum 17)' },
    ],
    appFocusBackend: virtualAppFocus(
      () => current,
      async () => {
        if (pauseNext) {
          pauseNext = false;
          await new Promise<void>((resolve) => {
            releaseFocus = resolve;
            process.send?.({ kind: 'fixturePaused' });
          });
        }
      },
    ),
    clock: () => clock,
    setInterval(callback: () => void, period: number) {
      timers.push({ callback, period, next: clock + period });
    },
    backendFactory: (config: Config) => new ScenarioSession(config),
    metadataFactory: () => ({
      hydrate() {},
      async refresh(agents: AgentSnapshot[]) {
        return agents;
      },
    }),
    renderer: {
      svg: require('../../../src/render/visuals').svg,
      pulse: () => 0,
    },
  };
}
