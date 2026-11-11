import type { AgentSnapshot } from '../../domain/types';

export type SessionFocus = {
  session: string;
  window: string | null;
  block: string | null;
};
/** The window fields of a Rex session inspection that focus is read from. */
export interface RexWindow {
  window_id: string;
  focused_block_id?: string | null;
}
export interface RexSessionSnapshot {
  active_window_id?: string | null;
  windows: RexWindow[];
}
/** Server focus is a display hint. It must never satisfy a native input preflight. */
export function sessionFocus(
  session: string,
  snapshot: RexSessionSnapshot,
): SessionFocus {
  const active = snapshot.windows.filter(
    (w: RexWindow) => w.window_id === snapshot.active_window_id,
  );
  const window = active.length === 1 ? active[0] : null;
  return {
    session,
    window: window?.window_id ?? null,
    block:
      typeof window?.focused_block_id === 'string'
        ? window.focused_block_id
        : null,
  };
}
export class RexDisplayFocus {
  private previous?: {
    client: string;
    signature: string;
    block: string | null;
  };
  observed(client: string, block: string) {
    if (this.previous?.client === client) this.previous.block = block;
  }
  reset() {
    this.previous = undefined;
  }
  async read(
    client: { client_id: string; session_ids?: string[] },
    sessions: SessionFocus[],
    agents: AgentSnapshot[],
    visible: (id: string) => Promise<string>,
  ) {
    const attached = client.session_ids;
    const choices = Array.isArray(attached)
      ? sessions.filter((s) => attached.includes(s.session))
      : sessions;
    if (
      choices.length === 1 &&
      (attached?.length === 1 || (!attached && sessions.length === 1)) &&
      choices[0].block
    ) {
      this.reset();
      const { session, window, block } = choices[0];
      return agents.find(
        (a) =>
          a.session === session && a.window === window && a.block === block,
      );
    }
    // Multiple attachments have independent active windows. Never choose the
    // first session. A change invalidates the last native display observation;
    // an unchanged poll (including after an unsuccessful copy) does no I/O.
    const signature = JSON.stringify([
      client.client_id,
      (attached || []).slice().sort(),
      choices
        .map((s) => [s.session, s.window, s.block])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ]);
    if (this.previous?.signature !== signature) {
      const record = {
        client: client.client_id,
        signature,
        block: null as string | null,
      };
      this.previous = record;
      try {
        record.block = await visible(client.client_id);
      } catch {
        /* No dot on an uncertain selection. */
      }
    }
    const matches = agents.filter((a) => a.block === this.previous?.block);
    return matches.length === 1 ? matches[0] : undefined;
  }
}
