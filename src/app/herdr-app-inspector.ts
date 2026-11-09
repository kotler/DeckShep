import {
  herdrAppChecks,
  type AppDiagnosticState,
} from './herdr-app-diagnostics';
interface SetupState extends AppDiagnosticState {
  preferences: Record<string, unknown>;
  panes: number;
  setupBusy: boolean;
  message: string;
}
export function appInspectorRequest(
  event: {
    context: string;
    payload?: { kind?: string; preferences?: unknown };
  },
  options: {
    state(): SetupState;
    save(patch: unknown): void;
    emit(
      event: string,
      context: string,
      payload: Record<string, unknown>,
    ): void;
  },
): void {
  const status = (message?: string) => {
    const state = options.state();
    options.emit('sendToPropertyInspector', event.context, {
      kind: 'status',
      profileScope: 'herdr-app',
      profileName: 'Herdr App',
      backend: 'herdr-app',
      preferences: state.preferences,
      offline: !state.connected,
      previewOnly: state.recordCount === 0,
      agents: state.panes,
      codex: 0,
      claude: 0,
      claudeIdentified: 0,
      metadata: 0,
      selected: null,
      verifiedFocus: false,
      focusRequestAvailable: state.connected && state.focusRequestEnabled,
      setupBusy: state.setupBusy,
      message: (message ?? state.message).slice(0, 160),
    });
  };
  if (event.payload?.kind === 'preferences') {
    try {
      options.save(event.payload.preferences);
      status('Preferences saved');
    } catch {
      status(
        'App preferences invalid; use an absolute App home and explicit checkboxes',
      );
    }
  } else if (event.payload?.kind === 'doctor') {
    options.emit('sendToPropertyInspector', event.context, {
      kind: 'doctor',
      sessions: [],
      checks: herdrAppChecks(options.state()),
    });
  } else
    status(
      ['status', 'refresh'].includes(event.payload?.kind ?? '')
        ? undefined
        : 'Use Herdr keyboard; native integration setup is unavailable',
    );
}
