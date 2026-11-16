import { projectAppControls, type AppControlProjection } from './app-controls';
import { appRoster, paneKey } from './app-navigation';
import type {
  AppPaneRef,
  AppPaneStatus,
  AppSelectionSnapshot,
} from './app-selection';
import type { AttentionKind } from './navigation';

type RosterPane = Readonly<
  Omit<AppPaneStatus, 'target'> & { target: Readonly<AppPaneRef> }
>;

export interface AppRosterView {
  readonly available: boolean;
  readonly slots: readonly Readonly<AppPaneRef>[];
  readonly tiles: readonly Readonly<{
    slot: Readonly<AppPaneRef> | undefined;
    pane: RosterPane | undefined;
  }>[];
  readonly agents: readonly RosterPane[];
  readonly destinations: Readonly<Record<string, RosterPane | undefined>>;
  readonly attention:
    Readonly<{ agent: RosterPane; kind: AttentionKind }> | undefined;
  readonly appSelected: Readonly<AppPaneRef> | null;
  readonly deckSelected: Readonly<AppPaneRef> | null;
  readonly selected: Readonly<AppPaneRef> | null;
  readonly bank: number;
  readonly banks: number;
  readonly canCollapse: boolean;
  readonly layoutKey: string;
}

function copySnapshot(snapshot: AppSelectionSnapshot): AppSelectionSnapshot {
  const copy = {
    ...snapshot,
    selected: snapshot.selected && Object.freeze({ ...snapshot.selected }),
    panes: snapshot.panes.map((pane) =>
      Object.freeze({
        ...pane,
        target: Object.freeze({ ...pane.target }),
      }),
    ),
  };
  Object.freeze(copy.panes);
  return Object.freeze(copy);
}

function project(
  snapshot: AppSelectionSnapshot | null,
  slots: readonly AppPaneRef[],
  deckSelected: AppPaneRef | null,
  bank: number,
  reveal: AppPaneRef | null = null,
): AppRosterView {
  let roster = appRoster(
    slots,
    snapshot,
    deckSelected ?? snapshot?.selected ?? null,
  );
  if (deckSelected && !roster.live.has(paneKey(deckSelected))) {
    deckSelected = null;
    roster = appRoster(slots, snapshot, snapshot?.selected ?? null);
  }
  const banks = Math.max(1, Math.ceil(roster.slots.length / 5));
  const index = reveal ? roster.indices.get(paneKey(reveal)) : undefined;
  bank =
    index === undefined
      ? Math.max(0, Math.min(Math.floor(bank), banks - 1))
      : Math.floor(index / 5);
  const tiles = Array.from({ length: 5 }, (_, column) =>
    Object.freeze({
      slot: roster.slots[bank * 5 + column],
      pane: roster.entries[bank * 5 + column],
    }),
  );
  const destinations: Record<string, RosterPane | undefined> = {
    next: roster.next,
    attention: roster.attention?.agent,
  };
  Object.setPrototypeOf(destinations, null);
  tiles.forEach((tile, column) => {
    destinations[`agent:${column}`] = tile.pane;
  });
  return Object.freeze({
    available: snapshot !== null,
    slots: Object.freeze(roster.slots),
    tiles: Object.freeze(tiles),
    agents: Object.freeze(roster.occupied),
    destinations: Object.freeze(destinations),
    attention:
      roster.attention &&
      Object.freeze({
        agent: roster.attention.agent,
        kind: roster.attention.kind,
      }),
    appSelected: snapshot?.selected ?? null,
    deckSelected,
    selected: deckSelected ?? snapshot?.selected ?? null,
    bank,
    banks,
    canCollapse:
      snapshot !== null && roster.slots.length > roster.occupied.length,
    layoutKey: JSON.stringify(
      roster.entries.map((pane) => paneKey(pane?.target)),
    ),
  });
}

function choose(
  snapshot: AppSelectionSnapshot | null,
  view: AppRosterView,
  target: AppPaneRef,
): AppRosterView {
  const pane = view.agents.find(
    (agent) => paneKey(agent.target) === paneKey(target),
  );
  if (!pane) throw Error('Request stale');
  return project(snapshot, view.slots, pane.target, view.bank, pane.target);
}

/** ADR 0008: selection and bank browsing use App facts and stable slots. */
export class AppRoster {
  #snapshot: AppSelectionSnapshot | null = null;
  #controls: AppControlProjection | null = null;
  #view = project(null, [], null, 0);

  get view(): AppRosterView {
    return this.#view;
  }

  observe(snapshot: AppSelectionSnapshot): AppRosterView {
    return this.#accept(snapshot);
  }

  acknowledgeFocus(
    snapshot: AppSelectionSnapshot,
    target: AppPaneRef,
  ): AppRosterView {
    return this.#accept(snapshot, target);
  }

  #accept(input: AppSelectionSnapshot, target?: AppPaneRef): AppRosterView {
    const snapshot = copySnapshot(input);
    // The controller retires source identity explicitly with reset(). Suspension
    // also retires the selection reveal history, while preserving the slots.
    const { controls, reveal } = projectAppControls(
      this.#controls,
      snapshot,
      '',
    );
    const deckSelected =
      paneKey(this.#view.appSelected) === paneKey(snapshot.selected)
        ? this.#view.deckSelected
        : null;
    let view = project(
      snapshot,
      this.#view.slots,
      deckSelected,
      this.#view.bank,
      reveal,
    );
    if (target) view = choose(snapshot, view, target);
    this.#snapshot = snapshot;
    this.#controls = controls;
    this.#view = view;
    return view;
  }

  select(target: AppPaneRef): AppRosterView {
    this.#view = choose(this.#snapshot, this.#view, target);
    return this.#view;
  }

  setBank(value: number): AppRosterView {
    this.#view = project(
      this.#snapshot,
      this.#view.slots,
      this.#view.deckSelected,
      value,
    );
    return this.#view;
  }

  page(): AppRosterView {
    if (!this.#view.available) return this.#view;
    return this.setBank((this.#view.bank + 1) % this.#view.banks);
  }

  collapse(): AppRosterView {
    if (!this.#view.available) return this.#view;
    this.#view = project(
      this.#snapshot,
      this.#view.agents.map((pane) => pane.target),
      this.#view.deckSelected,
      this.#view.bank,
    );
    return this.#view;
  }

  suspend(): AppRosterView {
    this.#snapshot = null;
    this.#controls = null;
    this.#view = project(null, this.#view.slots, null, this.#view.bank);
    return this.#view;
  }

  reset(): AppRosterView {
    this.#snapshot = null;
    this.#controls = null;
    this.#view = project(null, [], null, 0);
    return this.#view;
  }
}
