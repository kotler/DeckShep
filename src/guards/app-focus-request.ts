import type {
  AppFocusContext,
  AppFocusLease,
  AppFocusPermit,
  AppFocusState,
} from '../domain/app-focus-request';

function validContext(context: Omit<AppFocusContext, 'pressedAt'>): boolean {
  const numbers = [
    context.appearance,
    context.visibility,
    context.generation,
    context.endpointGeneration,
    context.page,
  ];
  return (
    context.scope === 'herdr-app' &&
    context.control === 'requestFocus' &&
    numbers.every((value) => Number.isSafeInteger(value) && value >= 0) &&
    context.endpointGeneration > 0 &&
    [
      context.backendKey,
      context.stamp,
      context.peerKey,
      context.recordKey,
      context.target?.space,
      context.target?.tab,
      context.target?.pane,
      context.target?.terminal,
    ].every(
      (value) =>
        typeof value === 'string' && /^[^\x00-\x1f\x7f]{1,1024}$/.test(value),
    ) &&
    /^t[1-9][0-9]*$/.test(context.target.terminal)
  );
}
function identity(context: Omit<AppFocusContext, 'pressedAt'>): string {
  return JSON.stringify([
    context.scope,
    context.control,
    context.appearance,
    context.visibility,
    context.generation,
    context.backendKey,
    context.page,
    context.stamp,
    context.armedAt,
    context.endpointGeneration,
    context.peerKey,
    context.recordKey,
    context.target.space,
    context.target.tab,
    context.target.pane,
    context.target.terminal,
  ]);
}

/** Request-only authority. It never mints a provider input or verified-focus grant. */
export class AppFocusAuthority {
  readonly #permits = new WeakMap<AppFocusPermit, AppFocusContext>();
  constructor(
    private readonly current: () => AppFocusState,
    private readonly now: () => number = () => performance.now(),
  ) {}
  issue(context: AppFocusContext): AppFocusPermit {
    this.assertCurrent(context);
    const permit = Object.freeze({}) as AppFocusPermit;
    this.#permits.set(permit, structuredClone(context));
    return permit;
  }
  begin(permit: AppFocusPermit): AppFocusLease {
    const context = this.#permits.get(permit);
    // Even a preflight failure or an overlapping attempt burns this press.
    this.#permits.delete(permit);
    if (!context) throw Error('Request expired');
    this.assertCurrent(context);
    let consumed = false;
    const check = () => {
      if (consumed) throw Error('Request expired');
      this.assertCurrent(context);
    };
    return {
      context: Object.freeze({
        ...context,
        target: Object.freeze({ ...context.target }),
      }),
      check,
      consume: (peerKey, recordKey, generation) => {
        check();
        consumed = true;
        if (
          peerKey !== context.peerKey ||
          recordKey !== context.recordKey ||
          generation !== context.endpointGeneration
        )
          throw Error('App changed');
      },
      postflight: () => {
        if (!consumed) throw Error('Request expired');
        this.assertCurrent(context);
      },
    };
  }
  private assertCurrent(context: AppFocusContext): void {
    const current = this.current(),
      now = this.now();
    if (
      !validContext(context) ||
      !validContext(current) ||
      current.visible !== true ||
      current.setupBusy !== false ||
      current.focusRequestEnabled !== true
    )
      throw Error('Focus refused');
    if (identity(context) !== identity(current)) throw Error('Request stale');
    if (
      ![now, context.armedAt, context.pressedAt].every(Number.isFinite) ||
      context.pressedAt < context.armedAt ||
      context.pressedAt > now ||
      now - context.pressedAt >= 1000
    )
      throw Error('Request expired');
  }
}
