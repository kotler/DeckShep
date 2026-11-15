export interface AppDiagnosticState {
  helperAvailable: boolean;
  recordCount: number;
  homeConfigured?: boolean;
  focusRequestEnabled?: boolean;
  connected?: boolean;
  verifiedPeer?: boolean;
}
/** Passive reporting only: never discovers processes, opens sockets or probes
 * the App. CLI callers leave profile-only preferences unknown. */
export function herdrAppChecks(state: AppDiagnosticState) {
  return [
    {
      id: 'herdr-app-helper',
      ok: state.helperAvailable,
      reason: state.helperAvailable
        ? 'App peer helper available'
        : 'App peer helper unavailable; reinstall this plugin',
    },
    {
      id: 'herdr-app-builds',
      ok: state.recordCount > 0,
      reason:
        state.recordCount > 0
          ? 'App navigation signature policy available'
          : 'No App navigation policy; focus requests disabled',
    },
    {
      id: 'herdr-app-home',
      ok: state.homeConfigured === true,
      reason:
        state.homeConfigured === undefined
          ? 'View App home in the Herdr App profile setup'
          : state.homeConfigured
            ? 'Explicit App home configured'
            : 'Choose an absolute App home in this profile',
    },
    {
      id: 'herdr-app-consent',
      ok: state.focusRequestEnabled === true,
      reason:
        state.focusRequestEnabled === undefined
          ? 'View focus-request consent in the Herdr App profile setup'
          : state.focusRequestEnabled
            ? 'Plain focus requests allowed; keyboard focus is not verified'
            : 'Plain focus-request consent is off',
    },
    {
      id: 'herdr-app-connection',
      ok: state.verifiedPeer === true,
      reason:
        state.connected === undefined
          ? 'App peer/build checks run only in the selected App profile'
          : state.verifiedPeer
            ? 'App peer/build matched; pane state is App-reported'
            : state.connected
              ? 'App observed; deck selection only'
              : 'No matched App peer/build connection',
    },
    {
      id: 'herdr-app-input',
      ok: true,
      reason:
        'Zoom and terminal input remain disabled; this path installs no Herdr mod',
    },
  ];
}
