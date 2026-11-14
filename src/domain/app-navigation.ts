import type {
  AppPaneRef,
  AppPaneStatus,
  AppSelectionSnapshot,
} from './app-selection';
import { attentionCandidates, type AttentionKind } from './navigation';

export function paneKey(target: AppPaneRef | null | undefined): string {
  return target
    ? JSON.stringify([target.space, target.tab, target.pane, target.terminal])
    : '';
}
export function appProvider(raw: string | null | undefined) {
  const value = raw?.toLowerCase();
  if (value === 'codex') return 'codex';
  return value === 'claude' || value === 'claude-code' ? 'claude-code' : null;
}
export function destinationName(pane: AppPaneStatus) {
  return pane.name || appProvider(pane.reportedApp) || 'Terminal';
}

/** Reconcile the complete validated App observation in stable physical slot order. */
export function appRoster(
  previous: readonly AppPaneRef[],
  snapshot: AppSelectionSnapshot | null,
  selected: AppPaneRef | null,
) {
  const slots = [...previous];
  const indices = new Map(slots.map((slot, i) => [paneKey(slot), i]));
  const live = new Map<string, AppPaneStatus>();
  for (const pane of snapshot?.panes ?? []) {
    if (!appProvider(pane.reportedApp)) continue;
    const key = paneKey(pane.target);
    live.set(key, pane);
    if (!indices.has(key)) {
      indices.set(key, slots.length);
      slots.push(pane.target);
    }
  }
  const entries = slots.map((slot) => live.get(paneKey(slot)));
  const occupied = entries.filter((p): p is AppPaneStatus => !!p);
  const current = paneKey(selected);
  const index = occupied.findIndex((p) => paneKey(p.target) === current);
  const attention = attentionCandidates(
    entries.map(
      (p) =>
        p && {
          agent: p,
          selected: paneKey(p.target) === current,
          state: p.reportedStatus?.toLowerCase() || 'unknown',
        },
    ),
  )[0];
  return {
    slots,
    indices,
    entries,
    occupied,
    live,
    attention,
    next:
      occupied.length >= 2
        ? occupied[(index + 1) % occupied.length]
        : undefined,
  };
}

export interface AppTargetConditions {
  action: 'tile' | 'next' | 'attention' | 'calibration';
  provider: string | null;
  name: string;
  reason: AttentionKind | null;
  appSelection: string;
  effectiveSelection: string;
}
/** ADR 0007: only App facts identify a navigation destination. Calibration
 * retains raw nullable provider evidence from a test-owned plain pane. */
export function matchesAppTarget(
  snapshot: AppSelectionSnapshot,
  target: AppPaneRef,
  c: AppTargetConditions,
  slotOrder?: readonly AppPaneRef[],
): boolean {
  const targetKey = paneKey(target);
  const matches = snapshot.panes.filter((p) => paneKey(p.target) === targetKey);
  if (matches.length !== 1) return false;
  const [p] = matches;
  if (c.action === 'calibration') return p.reportedApp === c.provider;
  if (
    !appProvider(p.reportedApp) ||
    appProvider(p.reportedApp) !== c.provider ||
    destinationName(p) !== c.name
  )
    return false;
  if (c.action === 'tile') return true;
  if (!slotOrder || paneKey(snapshot.selected) !== c.appSelection) return false;
  // Restore the start and stable order that produced the displayed action.
  // A shell may be the App selection even though it has no agent tile.
  const start =
    c.effectiveSelection === c.appSelection
      ? snapshot.selected
      : snapshot.panes.find(
          (p) =>
            appProvider(p.reportedApp) &&
            paneKey(p.target) === c.effectiveSelection,
        )?.target;
  if (start === undefined) return false;
  const fresh = appRoster(slotOrder, snapshot, start);
  if (c.action === 'next') return paneKey(fresh.next?.target) === targetKey;
  return (
    fresh.attention?.kind === c.reason &&
    paneKey(fresh.attention?.agent.target) === targetKey
  );
}
