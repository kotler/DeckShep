/** Proposed recipient semantics in memory only. Never an App capability record. */
import { isDeepStrictEqual } from 'node:util';
import { cycleCodexSetting } from '../../src/agents/codex/keyboard-settings';
import type { KeyboardView } from '../../src/domain/backend';
import { KeyboardScreen } from './keyboard-screen';

export interface PrototypeBinding {
  source: string;
  appLifetime: string;
  coreLifetime: string;
  connection: number;
  terminalLifetime: string;
  cliLifetime: string;
  chat: string;
  focusRevision: number;
  readyRevision: number;
  viewRevision: number;
}
interface Capture {
  id: number;
  route: 'native' | 'api';
  binding: PrototypeBinding;
  authorization: number;
  pressedAt: number;
  armedAt: number;
  clockDomain: string;
}
interface Operation {
  capture: Capture;
  closed: boolean;
  effects: number;
  screen: KeyboardScreen;
}
type Outcome =
  | { kind: 'confirmed'; model: string; effort: string; effects: number }
  | { kind: 'refused' | 'partial' | 'uncertain'; effects: number };

export class GuardedModelPrototype {
  readonly clockDomain = 'fixture-model-authority';
  now = 10000;
  armedAt = 10350;
  authorization = 1;
  enabled = true;
  ready = true;
  binding: PrototypeBinding = {
    source: 'observer-1',
    appLifetime: 'app-1',
    coreLifetime: 'core-1',
    connection: 1,
    terminalLifetime: 'terminal-1',
    cliLifetime: 'cli-1',
    chat: 'chat-a',
    focusRevision: 1,
    readyRevision: 1,
    viewRevision: 1,
  };
  readonly screens = new Map([
    ['chat-a', new KeyboardScreen()],
    ['chat-b', new KeyboardScreen()],
  ]);
  readonly effects: { chat: string; input: string }[] = [];
  readonly calls: string[] = [];
  #operation: Operation | null = null;
  #hold: { reached: () => void; wait: Promise<void> } | null = null;
  #holdAfter = 0;
  #nextCapture = 0;
  #captures = new Map<number, Capture>();
  #lostReply = false;
  quarantined = false;

  constructor() {
    for (const screen of this.screens.values())
      screen.models = ['Alpha', 'Beta', 'Gamma'];
  }
  capture(route: 'native' | 'api' = 'native'): Capture {
    const capture = structuredClone({
      id: ++this.#nextCapture,
      route,
      binding: this.binding,
      authorization: this.authorization,
      pressedAt: this.now,
      armedAt: this.armedAt,
      clockDomain: this.clockDomain,
    });
    if (this.#captures.size >= 64) this.#captures.clear();
    this.#captures.set(capture.id, structuredClone(capture));
    return capture;
  }
  holdNextEffect(after = 0) {
    let reached = () => {},
      release = () => {};
    const accepted = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#hold = { reached, wait };
    this.#holdAfter = after;
    return { accepted, release: () => release() };
  }
  invalidate() {
    this.authorization++;
    this.enabled = false;
    this.#captures.clear();
    if (this.#operation) this.#operation.closed = true;
    return { pending: false, effects: this.#operation?.effects ?? 0 };
  }
  focus(chat: string) {
    this.binding = {
      ...this.binding,
      chat,
      focusRevision: this.binding.focusRevision + 1,
    };
  }
  startWork() {
    this.ready = false;
    this.binding.readyRevision++;
  }
  loseReply() {
    this.#lostReply = true;
  }
  refresh() {
    // This reference authority has already closed execution; recovery is read-only.
    if (this.#operation) throw Error('Prototype pending');
    this.quarantined = false;
    this.enabled = true;
    this.authorization++;
    this.armedAt = this.now + 350;
  }
  #check(op: Operation) {
    const c = op.capture;
    if (
      op.closed ||
      this.#operation !== op ||
      !this.enabled ||
      !this.ready ||
      this.quarantined ||
      c.authorization !== this.authorization ||
      c.clockDomain !== this.clockDomain ||
      c.armedAt !== this.armedAt ||
      c.pressedAt < c.armedAt ||
      c.pressedAt > this.now ||
      this.now >= c.pressedAt + 2000 ||
      !isDeepStrictEqual(c.binding, this.binding)
    )
      throw Error('Prototype stale');
  }
  async #commit(
    op: Operation,
    expected: KeyboardView,
    input: string,
    effect: () => void,
  ) {
    this.#check(op); // Last client check, deliberately BEFORE the held queue.
    const hold = this.#hold && this.#holdAfter-- === 0 ? this.#hold : null;
    if (hold) {
      this.#hold = null;
      hold.reached();
      await hold.wait;
    }
    // Recipient comparison and effect are one synchronous critical section.
    this.#check(op);
    if (!isDeepStrictEqual(op.screen.view(), expected))
      throw Error('Prototype view changed');
    effect();
    op.effects++;
    this.effects.push({ chat: op.capture.binding.chat, input });
    if (this.#lostReply) {
      this.#lostReply = false;
      throw Error('Prototype reply lost');
    }
    return op.screen.view();
  }
  async run(
    route: 'native' | 'api',
    captured = this.capture(route),
  ): Promise<Outcome> {
    const issued = this.#captures.get(captured.id);
    this.#captures.delete(captured.id);
    if (captured.route !== route || !isDeepStrictEqual(issued, captured))
      return { kind: 'refused', effects: 0 };
    if (this.#operation || this.quarantined)
      return { kind: 'refused', effects: 0 };
    const screen = this.screens.get(captured.binding.chat);
    if (!screen) return { kind: 'refused', effects: 0 };
    const op: Operation = {
      capture: structuredClone(captured),
      screen,
      closed: false,
      effects: 0,
    };
    this.#operation = op;
    try {
      this.#check(op);
      this.calls.push(route);
      if (route === 'native') {
        const write = (view: KeyboardView, input: string) =>
          this.#commit(op, view, input, () => screen.send(input));
        await cycleCodexSetting(
          {
            read: async () => {
              this.#check(op);
              return screen.view();
            },
            key: write,
            paste: write,
          },
          'model',
        );
      } else {
        // Test-only oracle: the real Rex cycle runs on a COPY, supplying parity
        // for the proposed API route. No current API supplies this native catalog.
        const expected = screen.view();
        const oracle = Object.assign(
          new KeyboardScreen(),
          structuredClone(screen),
        );
        const write = async (_view: KeyboardView, input: string) => {
          oracle.send(input);
          return oracle.view();
        };
        await cycleCodexSetting(
          { read: async () => oracle.view(), key: write, paste: write },
          'model',
        );
        await this.#commit(op, expected, 'thread/settings/update', () => {
          screen.model = oracle.model;
          screen.effort = oracle.effort;
          screen.surface = oracle.surface;
          screen.command = oracle.command;
        });
      }
      return {
        kind: 'confirmed',
        model: screen.models[screen.model],
        effort: screen.levels[screen.effort],
        effects: op.effects,
      };
    } catch (error) {
      const uncertain =
        error instanceof Error && error.message === 'Prototype reply lost';
      if (op.effects) this.quarantined = true;
      return {
        kind: uncertain ? 'uncertain' : op.effects ? 'partial' : 'refused',
        effects: op.effects,
      };
    } finally {
      op.closed = true;
      if (this.#operation === op) this.#operation = null;
    }
  }
}
