type AgentSnapshot = import('./types').AgentSnapshot;
type Config = import('./types').Config;
type PressContext = import('./types').PressContext;
const { verifiedAction } = require('./capabilities');
function isBackground(
  agent: import('./types').AgentSnapshot | null | undefined,
) {
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
function modeOf(agent: import('./types').AgentSnapshot | null | undefined) {
  if (
    !agent ||
    !['codex', 'claude-code'].includes(agent.app) ||
    ((agent.backend === 'herdr' &&
      (agent as any).nativeVerified === false) as any) ||
    (agent.app === 'claude-code' &&
      !(
        agent.backend !== 'herdr' &&
        agent.rexSettings?.process &&
        ['idle', 'done', 'error'].includes(agent.state)
      ) &&
      (!(agent as any).nativeVerified || !(agent as any).claudeControlsEnabled))
  )
    return 'unknown';
  if (isBackground(agent)) return 'background';
  if (['idle', 'done', 'error'].includes((agent as any).state)) return 'ready';
  if ((agent as any).state === 'working') return 'working';
  if ((agent as any).state === 'blocked' && (agent as any).kind === 'question')
    return 'question';
  if (
    (agent as any).state === 'blocked' &&
    (agent as any).kind === 'permission'
  )
    return 'approval';
  return 'unknown';
}
function homeRow(
  agent: import('./types').AgentSnapshot | null | undefined,
  capabilities?: ReadonlySet<string> | undefined,
) {
  const settingsAction =
    agent?.app === 'claude-code' ? 'claudeInfo' : 'permissions';
  switch (modeOf(agent)) {
    case 'ready':
      return [
        'model',
        'effort',
        agent?.rexSettings ? 'permissions' : settingsAction,
        (agent as any).app === 'claude-code' && !agent?.rexSettings
          ? 'claudeModeInfo'
          : 'plan',
        'interrupt',
      ];
    case 'working':
      return (
        capabilities
          ? !capabilities.has('composerCursor')
          : (agent as any).composerSupported === false
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
        (agent as any).app === 'claude-code' && (agent as any).claudeMultiSelect
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
  agent: import('./types').AgentSnapshot | null | undefined,
  capabilities?: ReadonlySet<string> | undefined,
) {
  return [
    'next',
    'banknext',
    'collapse',
    'none',
    'none',
    ...homeRow(agent, capabilities),
  ];
}
function layout(
  _page: number,
  agent: import('./types').AgentSnapshot | null | undefined,
  capabilities?: ReadonlySet<string>,
  controls?: ReadonlySet<import('./types').ControlId>,
) {
  const actions = rawLayout(agent, capabilities);
  if (!controls) return actions;
  return actions.map((action) =>
    verifiedAction(action, capabilities ?? new Set(), controls)
      ? action
      : 'none',
  );
}
const localActions: Set<string> = new Set([
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
  'next',
]);
function needsContext(action: string) {
  return !localActions.has(action) && !action.startsWith('agent:');
}
function needsChat(
  action: string,
  target: import('./types').AgentSnapshot | null | undefined,
) {
  return target?.state !== 'blocked' && action !== 'zoom';
}
module.exports = {
  isBackground,
  modeOf,
  homeRow,
  layout,
  needsContext,
  needsChat,
  localActions,
};

export {};
