import type { AgentSnapshot } from './types';

/** Why the selected agent's row 3 keys are unavailable. Display only: a
 * blocker never enables, disables or delivers anything. */
export type ControlBlocker =
  | 'claude-off'
  | 'checks-off'
  | 'custom-keys'
  | 'cli-unverified'
  | 'view-unreadable'
  | 'not-at-prompt'
  | 'no-status'
  | 'codex-unverified';

/** `caption` is the key's second line (at most 15 characters); `help` is the
 * setup line (at most 160). `{backend}` is replaced with the terminal's name. */
export const BLOCKER_TEXT: Readonly<
  Record<ControlBlocker, { caption: string; help: string }>
> = Object.freeze({
  'claude-off': {
    caption: 'Enable Claude',
    help: 'Claude keys are off. Turn on "Enable Claude native controls" in this key\'s settings.',
  },
  'checks-off': {
    caption: 'Enable checks',
    help: 'Visible-pane checks are off. The deck must confirm which pane is on screen before it sends a key.',
  },
  'custom-keys': {
    caption: 'Custom keys',
    help: 'Claude has a custom keybindings.json. Native controls work only with the default keybindings.',
  },
  'cli-unverified': {
    caption: 'CLI unverified',
    help: "The pane's foreground process did not match a native Claude Code session record.",
  },
  'view-unreadable': {
    caption: 'Pane unreadable',
    help: '{backend} returned no stable view of this pane. It may be redrawing, scrolled or hidden.',
  },
  'not-at-prompt': {
    caption: 'Not at prompt',
    help: 'Claude is not showing an empty prompt, so the idle keys stay off. Close any open dialog or clear typed text.',
  },
  'no-status': {
    caption: 'No status yet',
    help: '{backend} has no status record for this agent yet. One appears after the agent starts its first turn.',
  },
  'codex-unverified': {
    caption: 'Not verified',
    help: 'Codex keyboard controls are not marked verified in config.json.',
  },
});

export interface BlockerOptions {
  /** Visible-pane (clipboard) consent. */
  visibleChecks: boolean;
  claudeEnabled: boolean;
}

/** The first known reason, most actionable first, or null when none is known. */
export function controlBlocker(
  agent: AgentSnapshot | null | undefined,
  options: BlockerOptions,
): ControlBlocker | null {
  if (!agent || agent.backend === 'herdr') return null;
  if (agent.app === 'claude-code') {
    if (!options.claudeEnabled) return 'claude-off';
    // Hook-bound Claude controls do not depend on the passive pane read.
    const hookBound =
      agent.nativeVerified === true && agent.claudeControlsEnabled === true;
    if (!hookBound) {
      if (!options.visibleChecks) return 'checks-off';
      if (agent.rexSettings?.why) return agent.rexSettings.why;
    }
    // A provider message already on the snapshot is more specific.
    return agent.state === 'unknown' && !agent.claudeError ? 'no-status' : null;
  }
  if (agent.app === 'codex') {
    if (agent.rexSettings?.why) return agent.rexSettings.why;
    return agent.state === 'unknown' ? 'no-status' : null;
  }
  return null;
}

export function blockerHelp(blocker: ControlBlocker, backend: string): string {
  return BLOCKER_TEXT[blocker].help.replace('{backend}', backend);
}
