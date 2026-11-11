import type { AgentSnapshot, BackendCapability, ControlId } from './types';
import { verifiedAction } from './capabilities';

export function isBackground(agent: AgentSnapshot | null | undefined) {
  return (
    agent?.app === 'codex' &&
    agent.state === 'working' &&
    agent.backgroundOnly === true &&
    typeof agent.statusAt === 'string' &&
    agent.activityStatusAt === agent.statusAt &&
    Array.isArray(agent.backgroundIds) &&
    agent.backgroundIds.length > 0 &&
    !!agent.backgroundTurnId
  );
}
export function modeOf(agent: AgentSnapshot | null | undefined) {
  if (
    !agent ||
    !['codex', 'claude-code'].includes(agent.app) ||
    (agent.backend === 'herdr' && agent.nativeVerified === false) ||
    (agent.app === 'claude-code' &&
      !(
        agent.backend !== 'herdr' &&
        agent.rexSettings?.process &&
        ['idle', 'done', 'error'].includes(agent.state)
      ) &&
      (!agent.nativeVerified || !agent.claudeControlsEnabled))
  )
    return 'unknown';
  if (isBackground(agent)) return 'background';
  if (['idle', 'done', 'error'].includes(agent.state)) return 'ready';
  if (agent.state === 'working') return 'working';
  if (agent.state === 'blocked' && agent.kind === 'question') return 'question';
  if (agent.state === 'blocked' && agent.kind === 'permission')
    return 'approval';
  return 'unknown';
}
export function homeRow(
  agent: AgentSnapshot | null | undefined,
  capabilities?: ReadonlySet<BackendCapability> | undefined,
) {
  const settingsAction =
    agent?.app === 'claude-code' ? 'claudeInfo' : 'permissions';
  if (agent?.state === 'blocked' && ['auth', 'form'].includes(agent.kind ?? ''))
    return ['status', 'none', 'none', 'none', 'none'];
  switch (modeOf(agent)) {
    case 'ready':
      return [
        'model',
        'effort',
        agent?.rexSettings ? 'permissions' : settingsAction,
        agent?.app === 'claude-code' && !agent?.rexSettings
          ? 'claudeModeInfo'
          : 'plan',
        'interrupt',
      ];
    case 'working':
      return (
        capabilities
          ? !capabilities.has('composerCursor')
          : agent?.composerSupported === false
      )
        ? ['none', 'none', settingsAction, 'none', 'interrupt']
        : ['steer', 'queue', settingsAction, 'none', 'interrupt'];
    case 'background':
      return ['none', 'none', settingsAction, 'none', 'stopTerminals'];
    case 'question':
      return [
        'up',
        'down',
        'answer',
        'escape',
        agent?.app === 'claude-code' && agent.claudeMultiSelect
          ? 'claudeToggle'
          : 'interrupt',
      ];
    case 'approval':
      return [
        'approvalUp',
        'approvalDown',
        'approvalConfirm',
        'approvalEscape',
        'interrupt',
      ];
    case 'unknown':
    default:
      return ['status', 'none', settingsAction, 'none', 'interrupt'];
  }
}
function rawLayout(
  agent: AgentSnapshot | null | undefined,
  capabilities?: ReadonlySet<BackendCapability> | undefined,
) {
  return [
    'next',
    'banknext',
    'collapse',
    'none',
    'attention',
    ...homeRow(agent, capabilities),
  ];
}
export function layout(
  _page: number,
  agent: AgentSnapshot | null | undefined,
  capabilities?: ReadonlySet<BackendCapability>,
  controls?: ReadonlySet<ControlId>,
) {
  const actions = rawLayout(agent, capabilities);
  if (!controls) return actions;
  return actions.map((action) =>
    verifiedAction(action, capabilities ?? new Set(), controls)
      ? action
      : 'none',
  );
}
export const localActions: Set<string> = new Set([
  'none',
  'status',
  'inputInfo',
  'claudeInfo',
  'claudeModeInfo',
  'more',
  'questions',
  'prompts',
  'back',
  'collapse',
  'banknext',
  'bankprev',
  'next',
  'previous',
  'attention',
]);
export function needsContext(action: string) {
  return !localActions.has(action) && !action.startsWith('agent:');
}
/**
 * The long-press action of a key, or null. `previous` and `bankprev` are
 * reachable only from here: `rawMapping` keeps them out of per-key overrides.
 */
export function holdActionOf(action: string): 'previous' | 'bankprev' | null {
  if (action === 'next') return 'previous';
  if (action === 'banknext') return 'bankprev';
  return null;
}
export function needsChat(
  action: string,
  target: AgentSnapshot | null | undefined,
) {
  return target?.state !== 'blocked' && action !== 'zoom';
}
