import type { AppPaneRef, AppPaneStatus } from '../domain/app-selection';
import {
  appProvider,
  destinationName,
  paneKey,
  type AppTargetConditions,
} from '../domain/app-navigation';
import { agentTileLines, ellipsize } from '../domain/labels';
import { navigationRow } from '../domain/layout';
import type { KeySpec, AgentFaceState } from '../render/spec';
export interface AppKey {
  settings: Record<string, unknown>;
  coordinates: { row: number; column: number };
  appearance: number;
  presented?: AppPresentation;
  lastImage?: string;
  specKey?: string;
  revision?: number;
  signature?: string;
  notice?: {
    until: number;
    message: string;
    generation: number;
  };
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
  conditions: AppTargetConditions | null;
  slotOrder?: readonly AppPaneRef[];
  focus: boolean;
  pressedAt?: number;
  setupBusy?: boolean;
}
export function defaultAppAction(key: AppKey): string {
  const { row, column } = key.coordinates;
  if (key.settings.action) return String(key.settings.action);
  if (row === 0) return `agent:${column}`;
  return row === 1 ? (navigationRow[column] ?? 'none') : 'none';
}
/** App-reported words only pick a colour/label; they never arm a control. */
const APP_STATES: Record<
  string,
  { palette: string; label: string; shape: AgentFaceState }
> = {
  idle: { palette: 'ready', label: 'Ready', shape: 'ready' },
  ready: { palette: 'ready', label: 'Ready', shape: 'ready' },
  working: { palette: 'working', label: 'Working', shape: 'working' },
  done: { palette: 'done', label: 'Done', shape: 'done' },
  blocked: { palette: 'blocked', label: 'Waiting', shape: 'question' },
  error: { palette: 'error', label: 'Error', shape: 'error' },
};
const FALLBACK_COLORS: Record<string, string> = {
  ready: '#167348',
  working: '#145ba0',
  done: '#1c8b5c',
  blocked: '#a7660c',
  error: '#a32f46',
  unknown: '#42475a',
};
export function appState(
  reported: string | null | undefined,
  palette: Record<string, string> = {},
) {
  const state = APP_STATES[String(reported || '').toLowerCase()];
  const key = state?.palette || 'unknown';
  return {
    label: state?.label || 'Unknown',
    shape: state?.shape ?? 'unknown',
    color: palette[key] || FALLBACK_COLORS[key],
  };
}
export function appTile(input: {
  key: AppKey;
  pane?: AppPaneStatus;
  slot?: AppPaneRef;
  selected: AppPaneRef | null;
  deckSelected: AppPaneRef | null;
  online: boolean;
  viewChanging?: boolean;
  consent: boolean;
  mapped?: string;
  reason?: string;
  bank: number;
  banks: number;
  now: number;
  palette?: Record<string, string>;
  style?: string;
}): KeySpec {
  const { key, pane, slot } = input;
  const base: KeySpec = {
    appNavigation: true,
    icon: 'blank',
    lines: [],
    color: '#38414b',
    pulse: 0,
    accent: '#485066',
    badge: '',
    agent: false,
    textOnly: false,
    style: input.style || 'signal',
  };
  if (key.notice && key.notice.until > input.now)
    return {
      ...base,
      lines: ['Unavailable', key.notice.message],
      color: '#893748',
    };
  const action = defaultAppAction(key);
  if (/^agent:[0-4]$/.test(action)) {
    const provider = appProvider(pane?.reportedApp);
    const state = appState(pane?.reportedStatus, input.palette);
    return {
      ...base,
      agent: true,
      modeCaption:
        pane && paneKey(pane.target) === paneKey(input.deckSelected)
          ? 'On deck'
          : pane && !input.consent
            ? 'Deck only'
            : undefined,
      icon: pane ? provider || 'blank' : 'empty',
      lines: pane
        ? agentTileLines(destinationName(pane), pane.folderName, state.label)
        : slot
          ? ['Closed pane', 'Collapse']
          : [
              'Herdr App',
              input.online
                ? 'No agent'
                : input.viewChanging
                  ? 'View changed'
                  : 'Unavailable',
            ],
      color: pane ? state.color : base.color,
      state: pane ? state.shape : slot ? 'closed' : 'empty',
      badge:
        pane && paneKey(pane.target) === paneKey(input.selected)
          ? 'selected'
          : '',
    };
  }
  // Navigation release (ADR 0008). Saved provider overrides cannot reveal a
  // setting or input route; the third row stays blank at its default positions.
  if (input.mapped === 'none') return base;
  if (action === 'collapse')
    return { ...base, icon: 'collapse', lines: ['Collapse'] };
  if (action === 'banknext')
    return {
      ...base,
      icon: 'next',
      lines: ['Page', `${input.bank + 1}/${input.banks}`],
    };
  if ((action === 'attention' || action === 'next') && pane)
    return {
      ...base,
      icon: action,
      modeCaption:
        action === 'attention' && !input.consent ? 'Deck only' : undefined,
      lines: [
        action === 'next' ? 'Next agent' : 'Attention',
        ellipsize(destinationName(pane), 120, 26),
        ...(action === 'attention'
          ? [input.reason || '']
          : input.consent
            ? []
            : ['Deck only']),
      ],
    };
  return base;
}
