/** App model addresses are not process, core or provider identities. */
export interface AppPaneRef {
  space: string;
  tab: string;
  pane: string;
  terminal: string;
}
export interface AppPaneStatus {
  target: AppPaneRef;
  reportedApp: string | null;
  reportedStatus: string | null;
  name: string | null;
}
export interface AppSelectionSnapshot {
  provenance: 'app-model';
  endpointGeneration: number;
  panes: AppPaneStatus[];
  selected: AppPaneRef | null;
  /** Even matching status/list/status reads cannot prove keyboard ownership. */
  verifiedFocus: false;
}
