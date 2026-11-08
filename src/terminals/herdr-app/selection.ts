import type {
  AppPaneRef,
  AppPaneStatus,
  AppSelectionSnapshot,
} from '../../domain/app-selection';
import { validate, type schemas } from '../../schemas';
import type { z } from 'zod';

type World = z.infer<typeof schemas.herdrAppWorld>;
type Status = z.infer<typeof schemas.herdrAppStatus>;
export interface AppSelectionPort {
  readonly generation: number;
  ls(signal?: AbortSignal): Promise<unknown>;
  status(signal?: AbortSignal): Promise<unknown>;
}

function selectionKey(status: Status): string {
  return JSON.stringify([
    status.space,
    status.tab,
    status.focused_pane,
    status.agent,
    status.layout,
  ]);
}
function assertView(status: Status): void {
  // Model selection can coexist with another keyboard owner. These known
  // exceptional contexts are refused even for selection feedback.
  if (
    status.overlays.length ||
    Object.keys(status.floats).length ||
    status.errors.length
  )
    throw Error('App view unavailable');
}
function localPanes(world: World): AppPaneStatus[] {
  const spaces = new Set<string>(),
    tabs = new Set<string>(),
    panes = new Set<string>(),
    result: AppPaneStatus[] = [];
  for (const space of world.spaces) {
    if (spaces.has(space.id)) throw Error('App topology ambiguous');
    spaces.add(space.id);
    for (const tab of space.tabs) {
      if (tabs.has(tab.id)) throw Error('App topology ambiguous');
      tabs.add(tab.id);
      for (const terminal of tab.terminals) {
        if (panes.has(terminal.pane)) throw Error('App topology ambiguous');
        panes.add(terminal.pane);
        if (space.machine !== null || !/^t[1-9][0-9]*$/.test(terminal.terminal))
          continue;
        result.push({
          target: {
            space: space.id,
            tab: tab.id,
            pane: terminal.pane,
            terminal: terminal.terminal,
          },
          reportedApp: terminal.app,
          reportedStatus: terminal.status,
          name: terminal.name,
        });
      }
    }
  }
  return result;
}
function selectedPane(
  world: World,
  status: Status,
  panes: AppPaneStatus[],
): AppPaneRef | null {
  if (
    !world.spaces.length &&
    [status.space, status.tab, status.focused_pane, status.agent].every(
      (value) => value === null,
    )
  )
    return null;
  const spaces = world.spaces.filter((space) => space.active),
    tabs = spaces[0]?.tabs.filter((tab) => tab.active) ?? [];
  if (
    spaces.length !== 1 ||
    spaces[0].machine !== null ||
    spaces[0].id !== status.space ||
    tabs.length !== 1 ||
    tabs[0].id !== status.tab
  )
    throw Error('App selection changed');
  if (
    !tabs[0].terminals.length &&
    status.focused_pane === null &&
    status.agent === null
  )
    return null;
  const matches = panes.filter(
    ({ target }) =>
      target.space === status.space &&
      target.tab === status.tab &&
      target.pane === status.focused_pane,
  );
  if (
    matches.length !== 1 ||
    (status.agent !== null && status.agent !== matches[0].target.terminal)
  )
    throw Error('App selection ambiguous');
  return matches[0].target;
}

/** Read-only selection feedback. No core join, native-focus claim or control
 * authority is produced, including when all three reads agree. */
export class AppSelectionReader {
  #pending = false;
  constructor(
    private readonly client: AppSelectionPort,
    private readonly timeoutMs = 1000,
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000)
      throw Error('Invalid App read limit');
  }
  async read(signal?: AbortSignal): Promise<AppSelectionSnapshot> {
    if (this.#pending) throw Error('App read pending');
    const deadline = performance.now() + this.timeoutMs,
      bounded = AbortSignal.any([
        AbortSignal.timeout(this.timeoutMs),
        ...(signal ? [signal] : []),
      ]);
    this.#pending = true;
    try {
      if (bounded.aborted) throw Error('App read cancelled');
      const before = validate(
          'herdrAppStatus',
          await this.client.status(bounded),
        ),
        generation = this.client.generation;
      this.assertCurrent(generation, bounded, deadline);
      assertView(before);
      const world = validate('herdrAppWorld', await this.client.ls(bounded));
      this.assertCurrent(generation, bounded, deadline);
      const after = validate(
        'herdrAppStatus',
        await this.client.status(bounded),
      );
      this.assertCurrent(generation, bounded, deadline);
      assertView(after);
      if (selectionKey(before) !== selectionKey(after))
        throw Error('App selection changed');
      const panes = localPanes(world);
      return {
        provenance: 'app-model',
        endpointGeneration: generation,
        panes,
        selected: selectedPane(world, after, panes),
        verifiedFocus: false,
      };
    } finally {
      this.#pending = false;
    }
  }
  private assertCurrent(
    generation: number,
    signal: AbortSignal,
    deadline: number,
  ): void {
    if (signal.aborted || performance.now() >= deadline)
      throw Error('App read expired');
    if (
      !Number.isSafeInteger(generation) ||
      generation < 1 ||
      this.client.generation !== generation
    )
      throw Error('App endpoint changed');
  }
}
