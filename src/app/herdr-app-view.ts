import type { AppPaneRef, AppPaneStatus } from '../domain/app-selection';
export function paneKey(target: AppPaneRef | null): string {
  return target
    ? JSON.stringify([target.space, target.tab, target.pane, target.terminal])
    : '';
}
export interface AppKey {
  settings: Record<string, unknown>;
  coordinates: { row: number; column: number };
  appearance: number;
  presented?: AppPresentation;
  lastImage?: string;
  notice?: { until: number; message: string; error: boolean; stamp: string };
}
export interface AppPresentation {
  action: string;
  appearance: number;
  visibility: number;
  generation: number;
  backendKey: string;
  stamp: string;
  armedAt: number;
  endpointGeneration: number;
  peerKey: string;
  recordKey: string;
  target: AppPaneRef | null;
  pressedAt?: number;
  setupBusy?: boolean;
}
export function appAction(
  key: AppKey,
  canRequest: boolean,
  hasRecords: boolean,
): string {
  if (!hasRecords) return 'none';
  const { row, column } = key.coordinates;
  const action =
    key.settings.action ||
    (row === 0
      ? `agent:${column}`
      : row === 1 && column === 0
        ? 'collapse'
        : row === 1 && column === 1
          ? 'next'
          : row === 2 && column === 0
            ? 'banknext'
            : 'none');
  if (['collapse', 'banknext'].includes(String(action))) return String(action);
  return canRequest &&
    (action === 'next' || /^agent:[0-4]$/.test(String(action)))
    ? String(action)
    : 'none';
}
function short(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
    .slice(0, 15);
}
export function appTile(input: {
  key: AppKey;
  pane?: AppPaneStatus;
  slot?: AppPaneRef;
  selected: AppPaneRef | null;
  deckSelected: AppPaneRef | null;
  preview: boolean;
  online: boolean;
  consent: boolean;
  bank: number;
  banks: number;
  now: number;
}) {
  const { key, pane, slot } = input;
  if (input.preview)
    return {
      icon: 'blank',
      lines: ['Herdr App', 'Preview only'],
      color: '#38414b',
    };
  if (
    key.notice &&
    key.notice.until > input.now &&
    key.notice.stamp === key.presented?.stamp
  )
    return {
      icon: 'blank',
      lines: key.notice.error
        ? ['Unavailable', key.notice.message]
        : [key.notice.message, 'Not verified'],
      color: key.notice.error ? '#893748' : '#38414b',
    };
  const action =
    key.settings.action ||
    (key.coordinates.row === 1 && key.coordinates.column === 0
      ? 'collapse'
      : key.coordinates.row === 1 && key.coordinates.column === 1
        ? 'next'
        : key.coordinates.row === 2 && key.coordinates.column === 0
          ? 'banknext'
          : 'none');
  if (key.coordinates.row === 0 || /^agent:[0-4]$/.test(String(action))) {
    return {
      icon:
        pane?.reportedApp === 'codex' || pane?.reportedApp === 'claude-code'
          ? pane.reportedApp
          : 'empty',
      lines: pane
        ? [
            short(pane.name || pane.reportedApp || 'Terminal'),
            short(pane.reportedStatus || 'unknown'),
            paneKey(pane.target) === paneKey(input.deckSelected)
              ? 'Deck selected'
              : 'App reported',
          ]
        : slot
          ? ['Closed pane', 'Collapse clears']
          : ['Herdr App', input.online ? 'No pane' : 'Unavailable'],
      color: '#38414b',
      badge:
        pane && paneKey(pane.target) === paneKey(input.selected)
          ? 'selected'
          : undefined,
    };
  }
  if (action === 'collapse')
    return {
      icon: 'collapse',
      lines: ['Collapse', 'Closed slots'],
      color: '#38414b',
    };
  if (action === 'banknext')
    return {
      icon: 'next',
      lines: ['Pane bank', `${input.bank + 1}/${input.banks}`],
      color: '#38414b',
    };
  if (action === 'next')
    return {
      icon: 'next',
      lines: [
        'Next pane',
        !input.consent
          ? 'Consent off'
          : input.online
            ? 'Request only'
            : 'App offline',
      ],
      color: '#38414b',
    };
  return {
    icon: 'blank',
    lines: ['Herdr keyboard', 'Input disabled'],
    color: '#38414b',
  };
}
