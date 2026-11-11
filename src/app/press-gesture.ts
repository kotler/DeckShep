/** How long a key must stay down before its hold action fires. */
export const HOLD_MS = 450;

export type GestureKind = 'tap' | 'hold';

export interface GesturePorts {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PressGestures {
  /**
   * A key without a hold action taps on the spot. A key with one waits: tap
   * on `up`, hold after HOLD_MS. Returns true when the tap has to wait.
   */
  down(
    context: string,
    hasHold: boolean,
    fire: (kind: GestureKind) => void,
  ): boolean;
  /** Fires the tap unless the hold already fired. A stray `up` does nothing. */
  up(context: string): void;
  /** Drops a pending gesture without firing (the key disappeared). */
  cancel(context: string): void;
}

interface Pending {
  fire: (kind: GestureKind) => void;
  timer: unknown;
  held: boolean;
}

/** Pure bookkeeping for tap and hold; timers are injected. */
export function createPressGestures(ports: GesturePorts): PressGestures {
  const pending = new Map<string, Pending>();
  function drop(context: string): Pending | undefined {
    const entry = pending.get(context);
    if (entry) {
      ports.clearTimeout(entry.timer);
      pending.delete(context);
    }
    return entry;
  }
  return {
    down(context, hasHold, fire) {
      // A repeated down without an up means the up was lost: fire nothing.
      drop(context);
      if (!hasHold) {
        fire('tap');
        return false;
      }
      const entry: Pending = { fire, timer: undefined, held: false };
      entry.timer = ports.setTimeout(() => {
        if (pending.get(context) !== entry) return;
        entry.held = true;
        entry.fire('hold');
      }, HOLD_MS);
      pending.set(context, entry);
      return true;
    },
    up(context) {
      const entry = pending.get(context);
      if (!entry) return;
      const held = entry.held;
      drop(context);
      if (!held) entry.fire('tap');
    },
    cancel(context) {
      drop(context);
    },
  };
}
