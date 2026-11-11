/** A metadata-read address. It grants no focus or delivery authority. */
export interface PanelAddress {
  session: string;
  block: string;
  server: string;
}
export interface PanelProcessSnapshot {
  pid: number;
  userId: number;
  name: string;
  cwd: string;
  generation?: number;
}
export const PANEL_OBSERVATION_PHASES = [
  'context',
  'first-panel',
  'parse-first',
  'owner',
  'panel-owner',
  'panel-provider',
  'panel-directory',
  'foreground',
  'foreground-kind',
  'second-panel',
  'parse-second',
  'foreground-again',
  'compare',
  'result',
  'reporter',
  'record',
  'write',
  'complete',
  'rex-config',
  'rex-discovery',
  'rex-query',
  'rex-reply',
  'rex-timeout',
  'rex-permission',
  'rex-executable',
  'rex-output-limit',
  'rex-refused',
  'rex-option',
  'rex-target',
  'rex-exit',
  'rex-other',
] as const;
export type PanelObservationPhase = (typeof PANEL_OBSERVATION_PHASES)[number];
export type PanelReadPhase = Extract<PanelObservationPhase, `rex-${string}`>;
export type PanelProcessReader = (
  target: PanelAddress,
  progress?: (phase: PanelReadPhase) => void,
) => Promise<PanelProcessSnapshot>;
