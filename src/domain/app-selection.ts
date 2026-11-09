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

/** Display-only facts a herdr-core listing reported for one local address.
 * They label a key; they never become a target, permit or provider identity. */
export interface AppCoreFacts {
  address: string;
  name: string | null;
  title: string | null;
  state: string | null;
  app: string | null;
  statusTitle: string | null;
  kind: string | null;
}
export interface AppCoreSnapshot {
  provenance: 'core-listing';
  coreId: string;
  terminals: AppCoreFacts[];
}
