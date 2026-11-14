import type { AppPaneStatus, AppSelectionSnapshot } from './app-selection';
import { appProvider, paneKey } from './app-navigation';

/** Display-only App evidence. This is never a provider binding or input permit. */
export interface AppControlProjection {
  sourceKey: string;
  revision: number;
  pane: AppPaneStatus | null;
  provider: ReturnType<typeof appProvider>;
  state: string | null;
  model: boolean;
}

/** Follow the App selection once, preserving later local bank browsing. */
export function projectAppControls(
  previous: AppControlProjection | null,
  snapshot: AppSelectionSnapshot | null,
  sourceKey: string,
) {
  const matches = snapshot?.selected
    ? snapshot.panes.filter(
        (pane) => paneKey(pane.target) === paneKey(snapshot.selected),
      )
    : [];
  const candidate = matches.length === 1 ? matches[0] : null;
  const provider = appProvider(candidate?.reportedApp);
  // Herdr can retain an agent name after exit. Null status is a shell (ADR 0007).
  const pane =
    provider && candidate?.reportedStatus
      ? { ...candidate, target: { ...candidate.target } }
      : null;
  const state = pane?.reportedStatus?.toLowerCase() ?? null;
  const next: Omit<AppControlProjection, 'revision'> = {
    sourceKey,
    pane,
    provider: pane ? provider : null,
    state,
    model: provider === 'codex' && (state === 'idle' || state === 'ready'),
  };
  const unchanged =
    previous &&
    previous.sourceKey === sourceKey &&
    paneKey(previous.pane?.target) === paneKey(pane?.target) &&
    previous.pane?.reportedApp === pane?.reportedApp &&
    previous.pane?.reportedStatus === pane?.reportedStatus &&
    previous.pane?.name === pane?.name &&
    previous.pane?.folderName === pane?.folderName;
  const controls: AppControlProjection = unchanged
    ? previous
    : { ...next, revision: (previous?.revision ?? 0) + 1 };
  const reveal =
    pane &&
    (previous?.sourceKey !== sourceKey ||
      paneKey(previous?.pane?.target) !== paneKey(pane.target))
      ? pane.target
      : null;
  return { controls, reveal };
}
