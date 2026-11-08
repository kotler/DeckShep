/** Runtime-neutral contracts. Domain code has no platform imports. */
export type BackendId = 'rex' | 'herdr-tui' | 'herdr-app';
export type ProfileScope = 'rex' | 'herdr' | 'herdr-app';
export type ProviderId = 'codex' | 'claude-code';
export type BackendCapability =
  | 'discover'
  | 'focus'
  | 'verifiedFocus'
  | 'zoom'
  | 'sendKeys'
  | 'readPane'
  | 'composerCursor'
  | 'paneIdentity'
  | 'events';
export type AgentState =
  'idle' | 'working' | 'blocked' | 'done' | 'error' | 'unknown';
export interface TargetRef {
  session: string;
  block: string;
  window?: string;
  pid: number;
  app: string;
  name: string;
  terminalId?: string;
  chatId?: string | null;
  nativeIdentity?: string | null;
}
export interface AgentSnapshot extends TargetRef {
  state: AgentState;
  cwd?: string;
  backend?: 'rex' | 'herdr';
  workspaceId?: string;
  project?: string;
  chatName?: string;
  sessionLabel?: string;
  kind?: 'question' | 'permission' | 'auth' | null;
  statusAt?: string;
  composerSupported?: boolean;
  nativeVerified?: boolean;
  nativeError?: string;
  model?: string | null;
  modelName?: string;
  effort?: string | null;
  reviewer?: string | null;
  collaborationMode?: string | null;
  metadataAt?: number;
  runId?: string | null;
  backgroundOnly?: boolean;
  backgroundIds?: string[];
  backgroundTurnId?: string | null;
  activityStatusAt?: string | null;
  herdrChatId?: string;
  serverFocused?: boolean;
  atBottom?: boolean;
  claudeControlsEnabled?: boolean;
  claudeError?: string;
  claudeUiEpoch?: number;
  claudeTurnId?: string | null;
  claudeRequestId?: string | null;
  claudePicker?: boolean;
  claudePickerVisible?: boolean;
  claudeCycling?: boolean;
  claudeUiPending?: boolean;
  claudeMultiSelect?: boolean;
  claudeCheckboxList?: boolean;
  claudeQuestionReview?: boolean;
  claudeViewHash?: string;
  permissionMode?: string;
  vimMode?: string;
}
export type ControlId =
  | `agent:${number}`
  | 'collapse'
  | 'banknext'
  | 'next'
  | 'permissions'
  | 'more'
  | 'model'
  | 'effort'
  | 'effortIncrease'
  | 'effortDecrease'
  | 'plan'
  | 'interrupt'
  | 'steer'
  | 'queue'
  | 'zoom'
  | 'stopTerminals'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'answer'
  | 'escape'
  | 'questionPrev'
  | 'questionNext'
  | 'approvalUp'
  | 'approvalDown'
  | 'approvalConfirm'
  | 'approvalEscape'
  | 'review'
  | 'tests'
  | 'continue'
  | 'send'
  | 'none'
  | 'status'
  | 'inputInfo'
  | 'claudeInfo'
  | 'claudeModeInfo'
  | 'claudeToggle'
  | 'questions'
  | 'prompts'
  | 'back';
export interface ControlSpec {
  id: ControlId;
  requires: readonly BackendCapability[];
}
export interface PressContext {
  scope: ProfileScope;
  appearance?: number;
  visibility: number;
  generation: number;
  backendKey: string;
  action: string;
  page: number;
  stamp: string;
  target: AgentSnapshot | null;
  armedAt: number;
  pressedAt?: number;
  setupBusy: boolean;
  verifyChat: boolean;
}
export interface PreferencePatch {
  backend?: ProfileScope;
  allowClipboardFocus?: boolean;
  bringToFront?: boolean;
  claudeEnabled?: boolean;
  animationEnabled?: boolean;
  herdrTitleIdentity?: boolean;
  herdrSocketPath?: string;
  prompts?: Partial<Record<'review' | 'tests' | 'continue', string>>;
}
export interface Preferences {
  version: 2;
  revision: number;
  shared: Pick<PreferencePatch, 'animationEnabled' | 'prompts'>;
  profiles: {
    rex: Pick<
      PreferencePatch,
      'allowClipboardFocus' | 'bringToFront' | 'claudeEnabled'
    >;
    herdr: Pick<
      PreferencePatch,
      'herdrSocketPath' | 'herdrTitleIdentity' | 'claudeEnabled'
    >;
  };
}
export interface Config {
  backend: 'rex' | 'herdr';
  herdr: { socketPath: string; titleIdentity: boolean };
  clientLabel: string;
  statusMaxAgeMs: number;
  draftMaxAgeMs: number;
  metadataRefreshMs: number;
  daemonControls: { enabled: boolean; permissionsEnabled: boolean };
  effortKeys: { increase: string; decrease: string };
  aliases: Record<string, string>;
  sendKeys: Record<string, string>;
  prompts: Record<string, string>;
  controlVerified: Record<string, boolean>;
  animation: {
    enabled: boolean;
    frameMs: number;
    workingPeriodMs: number;
    completePulseMs: number;
  };
  palette: Record<string, string>;
  bringToFront: boolean;
  allowClipboardFocus: boolean;
  cycles: {
    models: { id: string; label: string }[];
    efforts: string[];
    autoSetupNewSessions: boolean;
  };
  modelDiscovery: {
    enabled: boolean;
    include: string[];
    effortLevels: string[];
  };
  appearance: { style: string };
  claude: { enabled: boolean };
  rexPath?: string;
  experimental?: { herdrApp: boolean };
}
export interface ComposerSnapshot {
  chatId: string;
  hash: string;
  cursor: { row: number; column: number };
  empty?: boolean;
  turnStamp?: string;
}
