import type {
  AppCoreFacts,
  AppCoreSnapshot,
  AppPaneRef,
  AppPaneStatus,
} from '../domain/app-selection';
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
/** App-reported words only pick a colour/label; they never arm a control. */
const APP_STATES: Record<string, { palette: string; label: string }> = {
  idle: { palette: 'ready', label: 'READY' },
  ready: { palette: 'ready', label: 'READY' },
  working: { palette: 'working', label: 'WORKING' },
  done: { palette: 'done', label: 'COMPLETE' },
  blocked: { palette: 'blocked', label: 'WAIT INPUT' },
  error: { palette: 'error', label: 'ERROR' },
};
const FALLBACK_COLORS: Record<string, string> = {
  ready: '#167348',
  working: '#145ba0',
  done: '#1c8b5c',
  blocked: '#a7660c',
  error: '#a32f46',
  unknown: '#42475a',
};
export function appProvider(reported: string | null | undefined) {
  const value = String(reported || '').toLowerCase();
  if (value === 'codex') return 'codex';
  if (value === 'claude' || value === 'claude-code') return 'claude-code';
  return null;
}
export function appState(
  reported: string | null | undefined,
  palette: Record<string, string> = {},
) {
  const state = APP_STATES[String(reported || '').toLowerCase()];
  const key = state?.palette || 'unknown';
  return {
    label: state?.label || 'UNKNOWN',
    color: palette[key] || FALLBACK_COLORS[key],
  };
}
const norm = (value: string | null | undefined) =>
  String(value || '').toLowerCase();
/** A core address is unique only within its core and the App may mirror a
 * different one, so facts label a pane only when the address is unique and
 * every word both sides report agrees. Any disagreement keeps App-only text. */
export function coreFacts(
  pane: AppPaneStatus | undefined,
  core: AppCoreSnapshot | null | undefined,
): AppCoreFacts | null {
  if (!pane || !core) return null;
  const matches = core.terminals.filter(
    (facts) => facts.address === pane.target.terminal,
  );
  if (matches.length !== 1) return null;
  const [facts] = matches;
  if (
    pane.reportedStatus &&
    facts.state &&
    norm(pane.reportedStatus) !== norm(facts.state)
  )
    return null;
  if (
    pane.reportedApp &&
    facts.app &&
    norm(pane.reportedApp) !== norm(facts.app)
  )
    return null;
  return facts;
}
function stateLabel(state: { label: string }, kind: string | null) {
  if (state.label !== 'WAIT INPUT') return state.label;
  return norm(kind) === 'permission' ? 'CHOICE' : state.label;
}
const { ellipsize } = require('../domain/labels') as {
  ellipsize(text: string, width?: number, fontSize?: number): string;
};
/** Same width-based ellipsis as Rex names; `ellipsize` strips bidi/controls. */
function appName(value: string): string {
  return ellipsize(value, 120, 26);
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
  palette?: Record<string, string>;
  core?: AppCoreFacts | null;
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
    const facts = input.core ?? null;
    const provider = appProvider(pane?.reportedApp || facts?.app);
    const state = appState(pane?.reportedStatus || facts?.state, input.palette);
    return {
      agent: true,
      icon: pane ? provider || 'blank' : 'empty',
      lines: pane
        ? [
            appName(
              facts?.statusTitle ||
                facts?.name ||
                pane.name ||
                facts?.title ||
                provider ||
                pane.reportedApp ||
                'Terminal',
            ),
            stateLabel(state, facts?.kind ?? null),
            paneKey(pane.target) === paneKey(input.deckSelected)
              ? 'Deck selected'
              : 'App reported',
          ]
        : slot
          ? ['Closed pane', 'Collapse clears']
          : ['Herdr App', input.online ? 'No pane' : 'Unavailable'],
      color: pane ? state.color : '#38414b',
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
